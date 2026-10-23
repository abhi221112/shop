from .. import db
from ..util import ApiError, format_qty


async def list_combos(active_only: bool) -> list[dict]:
    rows = await db.fetch(
        f"""SELECT c.*, COALESCE(json_agg(json_build_object(
                 'productId', p.id, 'name', p.name, 'unit', p.unit, 'qty', ci.qty, 'price', p.price,
                 'stock', p.stock, 'active', p.active, 'imageUrl', p.image_url, 'tint', p.tint
               ) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL), '[]') AS items
            FROM combos c
            LEFT JOIN combo_items ci ON ci.combo_id = c.id
            LEFT JOIN products p ON p.id = ci.product_id
            {"WHERE c.active" if active_only else ""}
            GROUP BY c.id ORDER BY c.id"""
    )
    result = []
    for r in rows:
        items, regular = [], 0
        for i in r["items"]:
            qty, price = float(i["qty"]), float(i["price"])
            line = round(qty * price)
            regular += line
            items.append({**i, "qty": qty, "qtyLabel": format_qty(qty, i["unit"]), "lineTotal": line})
        available = bool(items) and all(i["active"] and float(i["stock"]) >= i["qty"] - 1e-9 for i in items)
        result.append({
            "id": r["id"], "name": r["name"], "description": r["description"], "price": r["price"],
            "active": r["active"], "tint": r["tint"], "items": items,
            "regularPrice": regular, "savings": max(0, regular - r["price"]), "available": available,
        })
    return result


async def save_combo(combo_id: int | None, b: dict) -> int:
    name = str(b.get("name") or "").strip()[:60]
    description = str(b.get("description") or "").strip()[:160]
    tint = str(b.get("tint") or "#FBEBC0")
    try:
        price = float(b.get("price"))
        items = [(int(i["productId"]), float(i["qty"])) for i in b.get("items") or []]
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "Enter the combo price and pick its vegetables")
    if not name:
        raise ApiError(400, "Enter a name, e.g. Daily Sabzi Combo")
    if price < 0:
        raise ApiError(400, "Enter a price")
    if not items:
        raise ApiError(400, "Add at least one vegetable to the combo")
    if len({pid for pid, _ in items}) != len(items):
        raise ApiError(400, "Each vegetable can only be in a combo once")
    async with db.transaction() as c:
        products = {p["id"]: p for p in await c.fetch("SELECT * FROM products WHERE id = ANY($1::int[])",
                                                          [pid for pid, _ in items])}
        for pid, qty in items:
            p = products.get(pid)
            if not p:
                raise ApiError(400, "A vegetable in this combo no longer exists")
            steps = qty / p["step"]
            if qty <= 0 or abs(steps - round(steps)) > 1e-6:
                raise ApiError(400, f"Choose {p['name']} in steps of {format_qty(p['step'], p['unit'])}")
        if combo_id:
            done = await c.execute(
                "UPDATE combos SET name = $2, description = $3, price = $4, active = $5, tint = $6 WHERE id = $1",
                combo_id, name, description, price, b.get("active", True) is not False, tint,
            )
            if done.endswith(" 0"):
                raise ApiError(404, "Combo not found")
            await c.execute("DELETE FROM combo_items WHERE combo_id = $1", combo_id)
        else:
            combo_id = await c.fetchval(
                "INSERT INTO combos (name, description, price, active, tint) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                name, description, price, b.get("active", True) is not False, tint,
            )
        for pid, qty in items:
            await c.execute("INSERT INTO combo_items (combo_id, product_id, qty) VALUES ($1, $2, $3)", combo_id, pid, qty)
    return combo_id
