"""Turns a cart (loose items + combo packs) into priced order lines, checking stock."""
from collections import defaultdict

from ..util import ApiError, format_qty


def _parse(items, combos) -> tuple[dict, dict]:
    loose, counts = {}, {}
    for it in items or []:
        try:
            pid, qty = int(it["productId"]), float(it["qty"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(400, "An item in your cart is not valid")
        if qty <= 0:
            raise ApiError(400, "An item in your cart is not valid")
        loose[pid] = loose.get(pid, 0) + qty
    for cb in combos or []:
        try:
            cid, n = int(cb["comboId"]), int(cb["count"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(400, "A combo in your cart is not valid")
        if not 1 <= n <= 20:
            raise ApiError(400, "Choose between 1 and 20 of a combo")
        counts[cid] = counts.get(cid, 0) + n
    if not loose and not counts:
        raise ApiError(400, "Your cart is empty")
    if len(loose) + len(counts) > 60:
        raise ApiError(400, "Too many items in one order")
    return loose, counts


async def build_lines(conn, items, combos, *, combos_enabled: bool, lock: bool = False):
    """Returns (lines, items_total, combo_savings). With lock=True, rows are locked and stock is taken."""
    loose, counts = _parse(items, combos)

    combo_rows = []
    if counts:
        if not combos_enabled:
            raise ApiError(409, "Combo packs are not available right now")
        combo_rows = await conn.fetch(
            """SELECT c.*, json_agg(json_build_object('productId', ci.product_id, 'qty', ci.qty)) AS items
               FROM combos c JOIN combo_items ci ON ci.combo_id = c.id
               WHERE c.id = ANY($1::int[]) GROUP BY c.id""",
            list(counts),
        )
        if len(combo_rows) != len(counts) or any(not r["active"] for r in combo_rows):
            raise ApiError(409, "A combo in your cart is no longer available")

    need = defaultdict(float)
    for pid, qty in loose.items():
        need[pid] += qty
    for r in combo_rows:
        for ci in r["items"]:
            need[ci["productId"]] += float(ci["qty"]) * counts[r["id"]]

    # Lock in id order so two checkouts can't deadlock each other.
    rows = await conn.fetch(
        f"SELECT * FROM products WHERE id = ANY($1::int[]) ORDER BY id{' FOR UPDATE' if lock else ''}", list(need)
    )
    products = {p["id"]: p for p in rows}
    for pid, total in need.items():
        p = products.get(pid)
        if not p or not p["active"]:
            raise ApiError(409, "An item in your cart is no longer available")
        if total > p["stock"] + 1e-9:
            raise ApiError(409, f"Only {format_qty(max(0, p['stock']), p['unit'])} of {p['name']} left")
    for pid, qty in loose.items():
        p = products[pid]
        steps = qty / p["step"]
        if abs(steps - round(steps)) > 1e-6:
            raise ApiError(400, f"Choose {p['name']} in steps of {format_qty(p['step'], p['unit'])}")

    lines = []
    for pid, qty in loose.items():
        p = products[pid]
        lines.append({"product": p, "qty": qty, "lineTotal": round(qty * p["price"]),
                      "comboId": None, "comboName": None, "comboCount": None})
    savings = 0.0
    for r in combo_rows:
        n, regular = counts[r["id"]], 0
        for ci in r["items"]:
            p = products[ci["productId"]]
            qty = float(ci["qty"]) * n
            line_total = round(qty * p["price"])
            regular += line_total
            lines.append({"product": p, "qty": qty, "lineTotal": line_total,
                          "comboId": r["id"], "comboName": r["name"], "comboCount": n})
        savings += max(0.0, regular - float(r["price"]) * n)

    if lock:
        for pid, total in need.items():
            await conn.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", total, pid)
    return lines, float(sum(line["lineTotal"] for line in lines)), round(savings, 2)


def public_lines(lines) -> list[dict]:
    return [{
        "productId": line["product"]["id"], "name": line["product"]["name"], "unit": line["product"]["unit"],
        "qty": line["qty"], "qtyLabel": format_qty(line["qty"], line["product"]["unit"]),
        "price": line["product"]["price"], "lineTotal": line["lineTotal"],
        "comboId": line["comboId"], "comboName": line["comboName"], "comboCount": line["comboCount"],
    } for line in lines]


async def first_order_eligible(conn, user_id: int) -> bool:
    return not await conn.fetchval(
        "SELECT 1 FROM orders WHERE user_id = $1 AND status <> 'cancelled' LIMIT 1", user_id
    )
