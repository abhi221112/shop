import secrets
from datetime import datetime, timezone

from .. import db
from ..util import ApiError, format_qty, parse_date
from . import notify
from .cart import build_lines, first_order_eligible, public_lines
from .offers import compute_bill, get_offers
from .complaints import to_complaint
from .referral import reward_referrer
from .wallet import balance, refund_order, spend
from .slots import upcoming_slots

ORDER_SELECT = """
  SELECT o.*, s.label AS slot_label, s.kind AS slot_kind,
         (SELECT row_to_json(c) FROM complaints c WHERE c.order_id = o.id) AS complaint,
         d.name AS delivery_name, d.phone AS delivery_phone,
         COALESCE(json_agg(json_build_object(
           'id', i.id, 'productId', i.product_id, 'name', i.name, 'unit', i.unit,
           'qty', i.qty, 'price', i.price, 'lineTotal', i.line_total, 'bulk', i.bulk,
           'comboId', i.combo_id, 'comboName', i.combo_name, 'comboCount', i.combo_count
         ) ORDER BY i.combo_name NULLS FIRST, i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
  FROM orders o
  JOIN slots s ON s.id = o.slot_id
  LEFT JOIN users d ON d.id = o.delivery_user_id
  LEFT JOIN order_items i ON i.order_id = o.id"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_order(r) -> dict:
    return {
        "id": r["id"],
        "code": r["code"],
        "userId": r["user_id"],
        "customerName": r["customer_name"],
        "customerPhone": r["customer_phone"],
        "address": r["address"],
        "pincode": r["pincode"],
        "slot": {"id": r["slot_id"], "date": r["slot_date"].isoformat(), "label": r["slot_label"],
                 "express": r["slot_kind"] == "express"},
        "dueAt": r["due_at"].isoformat() if r["due_at"] else None,
        "paymentMethod": r["payment_method"],
        "paymentStatus": r["payment_status"],
        "status": r["status"],
        "subtotal": r["subtotal"],
        "deliveryFee": r["delivery_fee"],
        "discount": r["discount"],
        "discountLines": r["discount_lines"],
        "walletUsed": r["wallet_used"],
        "gift": r["gift"],
        "total": r["total"],
        "delivery": {"id": r["delivery_user_id"], "name": r["delivery_name"], "phone": r["delivery_phone"]}
        if r["delivery_user_id"] else None,
        "history": r["history"],
        "proof": {"verified": r["delivered_verified"], "lat": r["delivered_lat"], "lng": r["delivered_lng"]}
        if r["status"] == "delivered" else None,
        "issue": {"text": r["issue"], "at": r["issue_at"].isoformat()} if r["issue"] else None,
        "complaint": to_complaint(r["complaint"]),
        "items": [{**i, "qtyLabel": format_qty(float(i["qty"]), i["unit"])} for i in r["items"]],
        "createdAt": r["created_at"].isoformat(),
    }


async def find_orders(where: str, *params, order_by: str = "o.created_at DESC") -> list[dict]:
    rows = await db.fetch(f"{ORDER_SELECT} WHERE {where} GROUP BY o.id, s.id, d.id ORDER BY {order_by}", *params)
    return [to_order(r) for r in rows]


async def get_order(order_id: int) -> dict:
    orders = await find_orders("o.id = $1", order_id)
    if not orders:
        raise ApiError(404, "Order not found")
    return orders[0]


def can_view(user, order: dict) -> bool:
    """Owner, admin, or the assigned delivery person may see an order."""
    if user["role"] == "admin":
        return True
    if user["role"] == "delivery" and order["delivery"] and order["delivery"]["id"] == user["id"]:
        return True
    return order["userId"] == user["id"]


async def create_order(user, body: dict) -> dict:
    payment_method = body.get("paymentMethod")
    slot_date = parse_date(body.get("slotDate"))
    try:
        slot_id, address_id = int(body.get("slotId")), int(body.get("addressId"))
    except (TypeError, ValueError):
        raise ApiError(400, "Choose a delivery address and slot")
    if payment_method not in ("upi", "cod"):
        raise ApiError(400, "Choose a payment method")
    if not slot_date:
        raise ApiError(400, "Choose a delivery slot")

    address = await db.fetchrow("SELECT * FROM addresses WHERE id = $1 AND user_id = $2", address_id, user["id"])
    if not address:
        raise ApiError(400, "Choose a delivery address")

    slot = next((s for s in await upcoming_slots()
                 if s["slotId"] == slot_id and s["date"] == slot_date.isoformat()), None)
    if not slot or slot["full"]:
        raise ApiError(409, "That delivery slot is no longer available. Please pick another.")

    async with db.transaction() as c:
        # Serialise bookings per slot so capacity can't be oversold.
        await c.execute("SELECT pg_advisory_xact_lock($1)", slot_id)
        cap = await c.fetchrow(
            """SELECT s.capacity, (SELECT count(*) FROM orders
                 WHERE slot_id = s.id AND slot_date = $2 AND status <> 'cancelled') AS n
               FROM slots s WHERE s.id = $1""",
            slot_id, slot_date,
        )
        if not cap or cap["n"] >= cap["capacity"]:
            raise ApiError(409, "That delivery slot just filled up. Please pick another.")

        offers = await get_offers(c)
        lines, items_total, combo_savings = await build_lines(
            c, body.get("items"), body.get("combos"), combos_enabled=offers["combos"]["enabled"], lock=True,
        )
        usable, wallet_total = await balance(c, user["id"], lock=True)
        bill = compute_bill(items_total, combo_savings, offers,
                            first_order=await first_order_eligible(c, user["id"]),
                            wallet=usable, wallet_balance=wallet_total, slot_fee=slot["fee"] or 0)

        # Fully covered by wallet credit / offers: nothing to collect.
        paid_up = bill["total"] <= 0
        if paid_up:
            payment_method = "cod"
        address_text = ", ".join(x for x in (address["line"], address["landmark"]) if x)
        seq = await c.fetchval("SELECT nextval('order_code_seq')")
        order_id = await c.fetchval(
            """INSERT INTO orders (code, user_id, customer_name, customer_phone, address, pincode, slot_id, slot_date,
                                   payment_method, subtotal, delivery_fee, discount, discount_lines, wallet_used,
                                   gift, total, history, due_at, payment_status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                       CASE WHEN $18::int IS NULL THEN NULL ELSE now() + make_interval(mins => $18::int) END, $19)
               RETURNING id""",
            f"VS-{seq}", user["id"], user["name"] or "Customer", user["phone"], address_text, address["pincode"],
            slot_id, slot_date, payment_method, items_total, bill["deliveryFee"] + bill["slotFee"],
            bill["discount"], bill["discountLines"], bill["walletUsed"], bill["gift"], bill["total"],
            [{"status": "new", "at": _now()}], slot["minutes"] if slot["express"] else None,
            "paid" if paid_up else "pending",
        )
        for line in lines:
            p = line["product"]
            await c.execute(
                """INSERT INTO order_items (order_id, product_id, name, unit, qty, price, line_total,
                                            combo_id, combo_name, combo_count, bulk)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)""",
                order_id, p["id"], p["name"], p["unit"], line["qty"], line["price"], line["lineTotal"],
                line["comboId"], line["comboName"], line["comboCount"], line["bulk"],
            )
        if bill["walletUsed"]:
            await spend(c, user["id"], bill["walletUsed"], order_id, f"VS-{seq}")

    order = await get_order(order_id)
    # UPI orders are announced once payment succeeds.
    if order["paymentMethod"] == "cod":
        await notify.order_status(order)
    return order


async def quote(user, body: dict) -> dict:
    """Prices a cart without placing it, so the cart and checkout show exactly what will be charged."""
    offers = await get_offers()
    slot_fee = 0
    slot_date = parse_date(body.get("slotDate"))
    if body.get("slotId") and slot_date:
        slot = next((s for s in await upcoming_slots()
                     if s["slotId"] == int(body["slotId"]) and s["date"] == slot_date.isoformat()), None)
        slot_fee = (slot or {}).get("fee") or 0
    async with db.pool.acquire() as c:
        lines, items_total, combo_savings = await build_lines(
            c, body.get("items"), body.get("combos"), combos_enabled=offers["combos"]["enabled"],
        )
        first = True if user is None else await first_order_eligible(c, user["id"])
        usable, wallet_total = await balance(c, user["id"]) if user else (0.0, 0.0)
    bill = compute_bill(items_total, combo_savings, offers, first_order=first, wallet=usable,
                        wallet_balance=wallet_total, slot_fee=slot_fee)
    return {**bill, "lines": public_lines(lines), "loggedIn": user is not None}


NEXT = {
    "new": ("confirmed", "cancelled"),
    "confirmed": ("packed", "cancelled"),
    "packed": ("out", "cancelled"),
    "out": ("delivered", "not_available"),
    "not_available": ("out", "cancelled"),
}


async def change_status(order_id: int, to: str, actor: str, proof: dict | None = None) -> dict:
    """Moves an order along. `proof` (for "delivered") records whether the customer's code was checked and where."""
    code, reward = None, None
    async with db.transaction() as c:
        o = await c.fetchrow("SELECT * FROM orders WHERE id = $1 FOR UPDATE", order_id)
        if not o:
            raise ApiError(404, "Order not found")
        if to not in NEXT.get(o["status"], ()):
            raise ApiError(409, f"Order {o['code']} is {o['status'].replace('_', ' ')} "
                                f"and can't be moved to {to.replace('_', ' ')}")
        if to == "confirmed" and o["payment_method"] == "upi" and o["payment_status"] != "paid":
            raise ApiError(409, f"{o['code']} is waiting for the customer's UPI payment")
        if to == "out" and not o["delivery_user_id"]:
            raise ApiError(400, f"Assign a delivery person to {o['code']} first")
        if to == "cancelled":
            # Summed per product: a vegetable can appear twice (loose and inside a combo).
            await c.execute(
                """UPDATE products p SET stock = p.stock + i.q
                   FROM (SELECT product_id, sum(qty) AS q FROM order_items
                         WHERE order_id = $1 AND product_id IS NOT NULL GROUP BY product_id) i
                   WHERE i.product_id = p.id""",
                order_id,
            )
            if o["wallet_used"]:
                await refund_order(c, o["user_id"], order_id, o["code"])
        if to == "out":
            # A fresh code each trip; the customer shares it only when the bag is in their hands.
            code = str(secrets.randbelow(9000) + 1000)
            await c.execute("UPDATE orders SET delivery_code = $2, code_attempts = 0 WHERE id = $1", order_id, code)
        entry = {"status": to, "at": _now(), "by": actor}
        if to == "delivered":
            reward = await reward_referrer(c, o["user_id"], order_id, await get_offers(c))
            proof = proof or {}
            entry["verified"] = bool(proof.get("verified"))
            await c.execute(
                "UPDATE orders SET delivered_verified = $2, delivered_lat = $3, delivered_lng = $4 WHERE id = $1",
                order_id, entry["verified"], proof.get("lat"), proof.get("lng"),
            )
        paid = "paid" if to == "delivered" and o["payment_method"] == "cod" else o["payment_status"]
        await c.execute(
            "UPDATE orders SET status = $2, payment_status = $3, history = $4, updated_at = now() WHERE id = $1",
            order_id, to, paid, [*o["history"], entry],
        )
    order = await get_order(order_id)
    await notify.order_status(order, delivery_code=code)
    if reward:
        phone, amount = reward
        await notify.send(phone, f"Your friend's first order was delivered. ₹{amount:g} has been added to your wallet.")
    return order


MAX_CODE_ATTEMPTS = 5


async def confirm_delivery(order_id: int, code: str, actor: str, lat=None, lng=None) -> dict:
    """Delivery person marks an order delivered by entering the code the customer tells them."""
    o = await db.fetchrow("SELECT status, delivery_code, code_attempts FROM orders WHERE id = $1", order_id)
    if not o:
        raise ApiError(404, "Order not found")
    if o["status"] != "out":
        raise ApiError(409, "Tap \"Picked up\" before marking this order delivered")
    if o["code_attempts"] >= MAX_CODE_ATTEMPTS:
        raise ApiError(429, "Too many wrong codes. Call the shop so they can confirm this delivery.")
    if not o["delivery_code"] or not secrets.compare_digest(o["delivery_code"], str(code or "").strip()):
        attempts = await db.fetchval(
            "UPDATE orders SET code_attempts = code_attempts + 1 WHERE id = $1 RETURNING code_attempts", order_id
        )
        left = MAX_CODE_ATTEMPTS - attempts
        raise ApiError(400, f"That code is not right. Ask the customer to check their order page ({left} tries left)."
                       if left > 0 else "Too many wrong codes. Call the shop so they can confirm this delivery.")
    try:
        lat, lng = (float(lat), float(lng)) if lat is not None and lng is not None else (None, None)
    except (TypeError, ValueError):
        lat, lng = None, None
    return await change_status(order_id, "delivered", actor, {"verified": True, "lat": lat, "lng": lng})


async def expire_unpaid_orders() -> None:
    """Cancels UPI orders left unpaid for 30 minutes so their stock goes back on sale."""
    rows = await db.fetch(
        """SELECT id FROM orders WHERE payment_method = 'upi' AND payment_status = 'pending' AND status = 'new'
           AND created_at < now() - interval '30 minutes'"""
    )
    for r in rows:
        try:
            await change_status(r["id"], "cancelled", "system: unpaid")
        except ApiError as e:
            print("Could not expire order", r["id"], e.message, flush=True)
