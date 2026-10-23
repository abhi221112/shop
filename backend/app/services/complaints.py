"""Bad-item reports: the customer sends photos, the shop checks them and refunds to the wallet."""
import json
from datetime import datetime, timezone

from .. import db
from ..uploads import remove_image, save_image
from ..util import ApiError
from . import notify
from .offers import get_offers
from .wallet import add_credit, spread_cap

MAX_PHOTOS = 3


def to_complaint(c) -> dict | None:
    if not c:
        return None
    c = json.loads(c) if isinstance(c, str) else c
    return {
        "id": c["id"], "status": c["status"], "text": c["text"], "items": c["items"], "photos": c["photos"],
        "refundAmount": c["refund_amount"], "spreadOrders": c["spread_orders"], "adminNote": c["admin_note"],
        "createdAt": c["created_at"], "resolvedAt": c["resolved_at"],
    }


async def create(order: dict, user, text: str, item_ids: list[int], photos: list) -> None:
    rules = (await get_offers())["refunds"]
    if not rules["enabled"]:
        raise ApiError(409, "Please call the shop about this order.")
    if order["status"] != "delivered":
        raise ApiError(409, "You can report a problem once the order is delivered.")
    delivered_at = next((h["at"] for h in reversed(order["history"]) if h["status"] == "delivered"), None)
    if delivered_at:
        days = (datetime.now(timezone.utc) - datetime.fromisoformat(delivered_at)).total_seconds() / 86400
        if days > rules["windowDays"]:
            raise ApiError(409, f"Problems can be reported within {rules['windowDays']} days of delivery. Please call the shop.")
    text = (text or "").strip()[:500]
    if not text:
        raise ApiError(400, "Tell us what was wrong")
    by_id = {i["id"]: i for i in order["items"]}
    chosen = [by_id[i] for i in dict.fromkeys(item_ids) if i in by_id]
    if not chosen:
        raise ApiError(400, "Pick the items that were not good")
    files = [p for p in photos if getattr(p, "filename", None)]
    if not files:
        raise ApiError(400, "Add at least one photo of the item")
    if len(files) > MAX_PHOTOS:
        raise ApiError(400, f"Add up to {MAX_PHOTOS} photos")
    if await db.fetchval("SELECT 1 FROM complaints WHERE order_id = $1", order["id"]):
        raise ApiError(409, "You have already reported a problem with this order.")

    urls = []
    try:
        for f in files:
            urls.append(await save_image(f))
        items = [{"orderItemId": i["id"], "name": i["name"], "qtyLabel": i["qtyLabel"], "lineTotal": i["lineTotal"],
                  "comboName": i.get("comboName")} for i in chosen]
        async with db.transaction() as c:
            await c.execute(
                "INSERT INTO complaints (order_id, user_id, items, text, photos) VALUES ($1, $2, $3, $4, $5)",
                order["id"], user["id"], items, text, urls,
            )
            # Also flags the order in Today's orders.
            await c.execute("UPDATE orders SET issue = $2, issue_at = now() WHERE id = $1", order["id"], text)
    except Exception:
        for u in urls:
            remove_image(u)
        raise
    await notify.send(order["customerPhone"], f"We got your report about order {order['code']}. The shop will check your photos and reply soon.")


async def list_for_admin(status: str | None) -> list[dict]:
    rows = await db.fetch(
        f"""SELECT c.*, o.code, o.total, o.customer_name, o.customer_phone, o.slot_date, o.payment_method,
                   (SELECT count(*) FROM complaints c2 WHERE c2.user_id = c.user_id) AS customer_complaints
            FROM complaints c JOIN orders o ON o.id = c.order_id
            {"WHERE c.status = $1" if status else ""}
            ORDER BY c.status <> 'pending', c.created_at DESC LIMIT 200""",
        *([status] if status else []),
    )
    return [{
        **to_complaint(dict(r) | {"created_at": r["created_at"].isoformat(),
                                  "resolved_at": r["resolved_at"].isoformat() if r["resolved_at"] else None}),
        "orderId": r["order_id"], "orderCode": r["code"], "orderTotal": r["total"],
        "customerName": r["customer_name"], "customerPhone": r["customer_phone"],
        "slotDate": r["slot_date"].isoformat(), "customerComplaints": r["customer_complaints"],
        "suggestedRefund": round(sum(float(i["lineTotal"]) for i in r["items"]), 2),
    } for r in rows]


async def resolve(complaint_id: int, approve: bool, *, amount=None, spread_orders=None, note: str = "") -> None:
    note = (note or "").strip()[:300]
    async with db.transaction() as c:
        row = await c.fetchrow(
            """SELECT c.*, o.code, o.total, o.customer_phone FROM complaints c JOIN orders o ON o.id = c.order_id
               WHERE c.id = $1 FOR UPDATE OF c""",
            complaint_id,
        )
        if not row:
            raise ApiError(404, "Report not found")
        if row["status"] != "pending":
            raise ApiError(409, "This report has already been answered")
        if not approve:
            if not note:
                raise ApiError(400, "Tell the customer why (they will see this note)")
            await c.execute(
                "UPDATE complaints SET status = 'rejected', admin_note = $2, resolved_at = now() WHERE id = $1",
                complaint_id, note,
            )
            message = f"About order {row['code']}: we could not approve a refund. {note}"
        else:
            try:
                amount, spread_orders = round(float(amount), 2), int(spread_orders)
            except (TypeError, ValueError):
                raise ApiError(400, "Enter the refund amount and over how many orders it can be used")
            if amount <= 0 or amount > float(row["total"]):
                raise ApiError(400, f"Refund must be between ₹1 and the order total (₹{row['total']:g})")
            if not 1 <= spread_orders <= 20:
                raise ApiError(400, "Spread the refund over 1 to 20 orders")
            cap = spread_cap(amount, spread_orders)
            await add_credit(c, row["user_id"], amount, f"Refund for bad items in order {row['code']}",
                             kind="refund", per_order_cap=cap, order_id=row["order_id"])
            await c.execute(
                """UPDATE complaints SET status = 'approved', refund_amount = $2, spread_orders = $3, admin_note = $4,
                          resolved_at = now() WHERE id = $1""",
                complaint_id, amount, spread_orders, note or None,
            )
            limit = f" You can use up to ₹{cap:g} of it per order." if cap else ""
            message = f"Sorry about order {row['code']}. ₹{amount:g} has been added to your wallet.{limit}"
    await notify.send(row["customer_phone"], message)
