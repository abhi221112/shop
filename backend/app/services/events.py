"""Event orders (wedding, anniversary…): the customer sends what they need, the shop calls back to confirm the price."""
from .. import db
from ..config import settings
from ..util import ApiError, format_qty, normalize_phone, parse_date, shop_date, unit_price
from . import notify

EVENT_TYPES = ("Wedding", "Anniversary", "Birthday", "Puja", "Party", "Other")
STATUSES = ("new", "confirmed", "delivered", "cancelled")
# Days needed to arrange large quantities from the mandi.
DAYS_AHEAD = 2


def to_request(r) -> dict:
    return {
        "id": r["id"],
        "userId": r["user_id"],
        "customerName": r["customer_name"],
        "customerPhone": r["customer_phone"],
        "eventType": r["event_type"],
        "eventDate": r["event_date"].isoformat(),
        "guests": r["guests"],
        "address": r["address"],
        "items": r["items"],
        "estimate": r["estimate"],
        "notes": r["notes"],
        "status": r["status"],
        "shopNote": r["shop_note"],
        "createdAt": r["created_at"].isoformat(),
    }


async def _priced_items(raw) -> list[dict]:
    wanted = {}
    for it in raw or []:
        try:
            pid, qty = int(it["productId"]), float(it["qty"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(400, "An item in your list is not valid")
        if not 0 < qty <= 10000:
            raise ApiError(400, "Enter a quantity for every item")
        wanted[pid] = wanted.get(pid, 0) + qty
    if len(wanted) > 40:
        raise ApiError(400, "Too many items in one request")
    rows = await db.fetch("SELECT * FROM products WHERE id = ANY($1::int[]) AND active", list(wanted))
    products = {p["id"]: p for p in rows}
    if len(products) != len(wanted):
        raise ApiError(409, "An item in your list is no longer sold")
    items = []
    for pid, qty in wanted.items():
        p = products[pid]
        price, bulk = unit_price(p, qty)
        items.append({"productId": pid, "name": p["name"], "unit": p["unit"], "qty": qty,
                      "qtyLabel": format_qty(qty, p["unit"]), "price": price, "bulk": bulk,
                      "lineTotal": round(qty * price)})
    return items


async def create(user, body: dict) -> dict:
    event_type = body.get("eventType")
    event_date = parse_date(body.get("eventDate"))
    address = str(body.get("address") or "").strip()[:300]
    notes = str(body.get("notes") or "").strip()[:1000]
    try:
        guests = int(body["guests"]) if body.get("guests") not in (None, "") else None
    except (TypeError, ValueError):
        raise ApiError(400, "Enter the number of guests as a number")

    if event_type not in EVENT_TYPES:
        raise ApiError(400, "Choose the type of event")
    if not event_date or event_date < shop_date(DAYS_AHEAD):
        raise ApiError(400, f"Book at least {DAYS_AHEAD} days before the event")
    if event_date > shop_date(365):
        raise ApiError(400, "Choose an event date within the next year")
    if guests is not None and not 1 <= guests <= 10000:
        raise ApiError(400, "Enter the number of guests")
    if not address:
        raise ApiError(400, "Enter the delivery address")
    items = await _priced_items(body.get("items"))
    if not items and not notes:
        raise ApiError(400, "Add the items you need, or write them in the notes")

    estimate = sum(i["lineTotal"] for i in items)
    r = await db.fetchrow(
        """INSERT INTO event_requests (user_id, customer_name, customer_phone, event_type, event_date, guests,
                                       address, items, estimate, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *""",
        user["id"], user["name"] or "Customer", user["phone"], event_type, event_date, guests,
        address, items, estimate, notes,
    )
    when = event_date.strftime("%d %b")
    await notify.send(user["phone"], f"We got your {event_type.lower()} order request for {when}. "
                                     f"{settings.shop_name} will call you to confirm the price.")
    admin = normalize_phone(settings.admin_phone) or settings.admin_phone
    await notify.send(admin, f"New {event_type.lower()} order request for {when} from {r['customer_name']} "
                             f"({user['phone']}), estimate ₹{estimate:g}.")
    return to_request(r)


async def mine(user_id: int) -> list[dict]:
    rows = await db.fetch("SELECT * FROM event_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", user_id)
    return [to_request(r) for r in rows]


async def find(status: str | None) -> list[dict]:
    if status:
        rows = await db.fetch("SELECT * FROM event_requests WHERE status = $1 ORDER BY event_date, id", status)
    else:
        rows = await db.fetch("SELECT * FROM event_requests ORDER BY created_at DESC LIMIT 200")
    return [to_request(r) for r in rows]


async def update(request_id: int, status: str, shop_note: str) -> dict:
    if status not in STATUSES:
        raise ApiError(400, "Choose a status")
    r = await db.fetchrow(
        """UPDATE event_requests SET status = $2, shop_note = $3, updated_at = now()
           WHERE id = $1 RETURNING *""",
        request_id, status, str(shop_note or "").strip()[:300],
    )
    if not r:
        raise ApiError(404, "Request not found")
    when = r["event_date"].strftime("%d %b")
    messages = {
        "confirmed": f"Your {r['event_type'].lower()} order for {when} is confirmed by {settings.shop_name}.",
        "delivered": f"Your {r['event_type'].lower()} order for {when} is delivered. Thank you!",
        "cancelled": f"Your {r['event_type'].lower()} order request for {when} was cancelled.",
    }
    if status in messages:
        note = f" {r['shop_note']}" if r["shop_note"] else ""
        await notify.send(r["customer_phone"], messages[status] + note)
    return to_request(r)
