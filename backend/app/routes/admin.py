import re

from fastapi import APIRouter, Body, Depends, Request

from .. import db
from ..auth import require_role
from ..services import complaints
from ..services.combos import list_combos, save_combo
from ..services.offers import get_offers, save_offers
from ..services.orders import change_status, find_orders, get_order
from ..uploads import remove_image, save_image
from ..config import settings
from ..services.slots import booked_counts, express_open_now, is_express, order_cutoff, scheduled_open_today
from ..util import ApiError, format_hour, format_range, normalize_phone, parse_date, shop_date, shop_hour_now, to_product

admin = require_role("admin")
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin)])


# Cancelled last; express orders on top, soonest due first.
ADMIN_ORDER = "o.status = 'cancelled', o.due_at IS NULL, o.due_at, s.start_hour, o.id"


def actor(user) -> str:
    return f"admin: {user['name'] or user['phone']}"


# ---------- Orders ----------

@router.get("/orders")
async def orders(date: str | None = None, slotId: int | None = None):
    day = parse_date(date) or shop_date()
    if slotId:
        return await find_orders("o.slot_date = $1 AND o.slot_id = $2", day, slotId,
                                 order_by=ADMIN_ORDER)
    return await find_orders("o.slot_date = $1", day, order_by=ADMIN_ORDER)


@router.get("/summary")
async def summary(date: str | None = None):
    day = parse_date(date) or shop_date()
    totals = await db.fetchrow(
        """SELECT count(*) AS orders,
                  COALESCE(sum(total), 0) AS sales,
                  COALESCE(sum(total) FILTER (WHERE payment_method = 'upi'), 0) AS upi,
                  COALESCE(sum(total) FILTER (WHERE payment_method = 'cod'), 0) AS cash,
                  count(*) FILTER (WHERE status IN ('new', 'confirmed')) AS to_pack,
                  count(*) FILTER (WHERE issue IS NOT NULL) AS issues
           FROM orders WHERE slot_date = $1 AND status <> 'cancelled'""",
        day,
    )
    slots = await db.fetch(
        """SELECT s.id, s.label, count(o.id) FILTER (WHERE o.status <> 'cancelled') AS orders
           FROM slots s LEFT JOIN orders o ON o.slot_id = s.id AND o.slot_date = $1
           GROUP BY s.id ORDER BY s.start_hour""",
        day,
    )
    low = await db.fetch("SELECT name FROM products WHERE active AND stock <= low_stock_at ORDER BY stock")
    pending = await db.fetchval("SELECT count(*) FROM complaints WHERE status = 'pending'")
    return {
        "date": day.isoformat(),
        "orders": totals["orders"],
        "sales": totals["sales"],
        "upi": totals["upi"],
        "cash": totals["cash"],
        "toPack": totals["to_pack"],
        "issues": totals["issues"],
        "pendingComplaints": pending,
        "lowStock": [p["name"] for p in low],
        "slots": [dict(s) for s in slots],
    }


@router.get("/orders/{order_id}")
async def order_detail(order_id: int):
    return await get_order(order_id)


@router.post("/orders/{order_id}/status")
async def set_status(order_id: int, body: dict = Body(default={}), user=Depends(admin)):
    status = str(body.get("status") or "")
    # Admin can close an order without the customer's code; it is recorded as unverified.
    label = actor(user) + (" (no code)" if status == "delivered" else "")
    return await change_status(order_id, status, label)


@router.post("/orders/assign")
async def assign(body: dict = Body(default={})):
    try:
        ids = [int(i) for i in body.get("orderIds") or []]
        delivery_user_id = int(body["deliveryUserId"]) if body.get("deliveryUserId") else None
    except (TypeError, ValueError):
        raise ApiError(400, "Pick orders and a delivery person")
    if not ids:
        raise ApiError(400, "Pick at least one order")
    if delivery_user_id and not await db.fetchval(
        "SELECT 1 FROM users WHERE id = $1 AND role = 'delivery'", delivery_user_id
    ):
        raise ApiError(400, "Pick a delivery person")
    await db.execute(
        """UPDATE orders SET delivery_user_id = $2, updated_at = now()
           WHERE id = ANY($1::int[]) AND status IN ('new', 'confirmed', 'packed', 'not_available')""",
        ids, delivery_user_id,
    )
    return await find_orders("o.id = ANY($1::int[])", ids, order_by="o.id")


# ---------- Offers & combos ----------

@router.get("/offers")
async def offers_settings():
    return await get_offers()


@router.put("/offers")
async def update_offers(body: dict = Body(default={})):
    return await save_offers(body)


@router.get("/combos")
async def all_combos():
    return await list_combos(active_only=False)


@router.post("/combos", status_code=201)
async def add_combo(body: dict = Body(default={})):
    combo_id = await save_combo(None, body)
    return next(c for c in await list_combos(active_only=False) if c["id"] == combo_id)


@router.put("/combos/{combo_id}")
async def edit_combo(combo_id: int, body: dict = Body(default={})):
    await save_combo(combo_id, body)
    return next(c for c in await list_combos(active_only=False) if c["id"] == combo_id)


@router.delete("/combos/{combo_id}")
async def delete_combo(combo_id: int):
    # Past orders keep their combo name; only the pack itself is removed.
    await db.execute("DELETE FROM combos WHERE id = $1", combo_id)
    return {"ok": True}


# ---------- Bad-item reports ----------

@router.get("/complaints")
async def complaint_list(status: str | None = None):
    return await complaints.list_for_admin(status if status in ("pending", "approved", "rejected") else None)


@router.post("/complaints/{complaint_id}/approve")
async def approve_complaint(complaint_id: int, body: dict = Body(default={})):
    await complaints.resolve(complaint_id, True, amount=body.get("amount"),
                             spread_orders=body.get("spreadOrders"), note=str(body.get("note") or ""))
    return {"ok": True}


@router.post("/complaints/{complaint_id}/reject")
async def reject_complaint(complaint_id: int, body: dict = Body(default={})):
    await complaints.resolve(complaint_id, False, note=str(body.get("note") or ""))
    return {"ok": True}


# ---------- Customers ----------

@router.get("/customers")
async def customers(q: str | None = None):
    search = f"%{(q or '').strip()}%"
    rows = await db.fetch(
        """SELECT u.id, u.name, u.phone, u.created_at,
                  count(o.id) FILTER (WHERE o.status <> 'cancelled') AS orders,
                  COALESCE(sum(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS spent,
                  max(o.created_at) FILTER (WHERE o.status <> 'cancelled') AS last_order,
                  (SELECT a.line || ', ' || a.pincode FROM addresses a WHERE a.user_id = u.id ORDER BY a.id LIMIT 1) AS address
           FROM users u LEFT JOIN orders o ON o.user_id = u.id
           WHERE u.role = 'customer' AND (u.name ILIKE $1 OR u.phone LIKE $1)
           GROUP BY u.id
           ORDER BY max(o.created_at) FILTER (WHERE o.status <> 'cancelled') DESC NULLS LAST, u.created_at DESC
           LIMIT 300""",
        search,
    )
    return [{
        "id": r["id"], "name": r["name"], "phone": r["phone"], "address": r["address"],
        "orders": r["orders"], "spent": r["spent"],
        "lastOrder": r["last_order"].isoformat() if r["last_order"] else None,
        "joined": r["created_at"].isoformat(),
    } for r in rows]


@router.get("/customers/{user_id}/orders")
async def customer_orders(user_id: int):
    return await find_orders("o.user_id = $1", user_id)


# ---------- Reports ----------

@router.get("/reports")
async def reports(days: int = 30):
    days = max(1, min(days, 365))
    end = shop_date()
    start = shop_date(-(days - 1))
    daily = await db.fetch(
        """SELECT d::date AS day,
                  count(o.id) AS orders,
                  COALESCE(sum(o.total), 0) AS sales,
                  COALESCE(sum(o.total) FILTER (WHERE o.payment_method = 'upi'), 0) AS upi,
                  COALESCE(sum(o.total) FILTER (WHERE o.payment_method = 'cod'), 0) AS cash
           FROM generate_series($1::date, $2::date, interval '1 day') d
           LEFT JOIN orders o ON o.slot_date = d::date AND o.status <> 'cancelled'
           GROUP BY d ORDER BY d""",
        start, end,
    )
    totals = await db.fetchrow(
        """SELECT count(*) FILTER (WHERE status <> 'cancelled') AS orders,
                  COALESCE(sum(total) FILTER (WHERE status <> 'cancelled'), 0) AS sales,
                  COALESCE(sum(total) FILTER (WHERE status <> 'cancelled' AND payment_method = 'upi'), 0) AS upi,
                  COALESCE(sum(total) FILTER (WHERE status <> 'cancelled' AND payment_method = 'cod'), 0) AS cash,
                  count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                  count(DISTINCT user_id) FILTER (WHERE status <> 'cancelled') AS customers
           FROM orders WHERE slot_date BETWEEN $1 AND $2""",
        start, end,
    )
    new_customers = await db.fetchval(
        "SELECT count(*) FROM users WHERE role = 'customer' AND created_at::date BETWEEN $1 AND $2", start, end
    )
    top = await db.fetch(
        """SELECT i.name, i.unit, sum(i.qty) AS qty, sum(i.line_total) AS revenue
           FROM order_items i JOIN orders o ON o.id = i.order_id
           WHERE o.slot_date BETWEEN $1 AND $2 AND o.status <> 'cancelled'
           GROUP BY i.name, i.unit ORDER BY revenue DESC LIMIT 10""",
        start, end,
    )
    slots = await db.fetch(
        """SELECT s.label, count(o.id) AS orders
           FROM slots s LEFT JOIN orders o ON o.slot_id = s.id AND o.status <> 'cancelled'
                                         AND o.slot_date BETWEEN $1 AND $2
           GROUP BY s.id ORDER BY s.start_hour""",
        start, end,
    )
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "totals": {
            "orders": totals["orders"], "sales": totals["sales"], "upi": totals["upi"], "cash": totals["cash"],
            "cancelled": totals["cancelled"], "customers": totals["customers"], "newCustomers": new_customers,
            "avgOrder": round(totals["sales"] / totals["orders"]) if totals["orders"] else 0,
        },
        "daily": [{"date": r["day"].isoformat(), "orders": r["orders"], "sales": r["sales"],
                   "upi": r["upi"], "cash": r["cash"]} for r in daily],
        "topProducts": [{"name": r["name"], "unit": r["unit"], "qty": r["qty"], "revenue": r["revenue"]} for r in top],
        "slots": [dict(r) for r in slots],
    }


# ---------- Products ----------

@router.get("/products")
async def all_products():
    rows = await db.fetch("SELECT * FROM products ORDER BY category, name")
    return [to_product(r) for r in rows]


def product_fields(b) -> dict:
    def num(key, default=None):
        try:
            return float(b.get(key) if b.get(key) not in (None, "") else default)
        except (TypeError, ValueError):
            return None

    tint = str(b.get("tint") or "")
    f = {
        "name": str(b.get("name") or "").strip()[:60],
        "localName": str(b.get("localName") or "").strip()[:60],
        "category": str(b.get("category") or "").strip()[:30] or "Everyday",
        "unit": b.get("unit"),
        "step": num("step"),
        "price": num("price"),
        "stock": num("stock", 0),
        "lowStockAt": num("lowStockAt", 5),
        "tint": tint if re.fullmatch(r"#[0-9a-fA-F]{6}", tint) else "#E4EED5",
    }
    if not f["name"]:
        raise ApiError(400, "Enter the vegetable name")
    if f["unit"] not in ("kg", "bunch", "piece"):
        raise ApiError(400, "Choose kg, bunch or piece")
    if not f["step"] or f["step"] <= 0:
        raise ApiError(400, "Enter the smallest quantity a customer can buy")
    if f["price"] is None or f["price"] < 0:
        raise ApiError(400, "Enter a price")
    if f["stock"] is None or f["stock"] < 0 or f["lowStockAt"] is None or f["lowStockAt"] < 0:
        raise ApiError(400, "Stock must be zero or more")
    return f


@router.post("/products", status_code=201)
async def add_product(request: Request):
    form = await request.form()
    f = product_fields(form)
    image_url = await save_image(form.get("image"))
    p = await db.fetchrow(
        """INSERT INTO products (name, local_name, category, unit, step, price, yesterday_price, price_date,
                                 stock, low_stock_at, tint, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11) RETURNING *""",
        f["name"], f["localName"], f["category"], f["unit"], f["step"], f["price"], shop_date(),
        f["stock"], f["lowStockAt"], f["tint"], image_url,
    )
    return to_product(p)


@router.patch("/products/{product_id}")
async def edit_product(product_id: int, request: Request):
    old = await db.fetchrow("SELECT * FROM products WHERE id = $1", product_id)
    if not old:
        raise ApiError(404, "Vegetable not found")
    form = await request.form()
    merged = {**to_product(old), **{k: v for k, v in form.items() if k != "image"}}
    f = product_fields(merged)
    new_image = await save_image(form.get("image"))
    image_url = new_image or (None if form.get("removeImage") == "true" else old["image_url"])
    p = await db.fetchrow(
        """UPDATE products SET name = $2, local_name = $3, category = $4, unit = $5, step = $6, price = $7,
                  stock = $8, low_stock_at = $9, tint = $10, image_url = $11, updated_at = now()
           WHERE id = $1 RETURNING *""",
        product_id, f["name"], f["localName"], f["category"], f["unit"], f["step"], f["price"],
        f["stock"], f["lowStockAt"], f["tint"], image_url,
    )
    if old["image_url"] and old["image_url"] != image_url:
        remove_image(old["image_url"])
    return to_product(p)


@router.put("/products/prices")
async def save_prices(rows: list[dict] = Body(default=[])):
    """Morning price update: [{id, price, stock, active}]. A price changed on a new day moves the old one to "yesterday"."""
    today = shop_date()
    async with db.transaction() as c:
        for row in rows:
            try:
                pid, price, stock = int(row["id"]), float(row["price"]), float(row["stock"])
            except (KeyError, TypeError, ValueError):
                raise ApiError(400, "Every row needs a price and stock")
            if price < 0 or stock < 0:
                raise ApiError(400, "Prices and stock must be zero or more")
            await c.execute(
                """UPDATE products SET
                     yesterday_price = CASE WHEN price <> $2 AND price_date IS DISTINCT FROM $5 THEN price
                                            ELSE yesterday_price END,
                     price_date      = CASE WHEN price <> $2 THEN $5 ELSE price_date END,
                     price = $2, stock = $3, active = $4, updated_at = now()
                   WHERE id = $1""",
                pid, price, stock, bool(row.get("active")), today,
            )
    return await all_products()


# ---------- Delivery staff ----------

@router.get("/staff")
async def staff():
    rows = await db.fetch(
        """SELECT u.id, u.name, u.phone,
                  count(o.id) FILTER (WHERE o.slot_date = $1 AND o.status IN ('packed', 'out')) AS active_orders
           FROM users u LEFT JOIN orders o ON o.delivery_user_id = u.id
           WHERE u.role = 'delivery' GROUP BY u.id ORDER BY u.name""",
        shop_date(),
    )
    return [{"id": s["id"], "name": s["name"], "phone": s["phone"], "activeOrders": s["active_orders"]} for s in rows]


@router.post("/staff", status_code=201)
async def add_staff(body: dict = Body(default={})):
    phone = normalize_phone(body.get("phone"))
    name = str(body.get("name") or "").strip()[:80]
    if not name:
        raise ApiError(400, "Enter their name")
    if not phone:
        raise ApiError(400, "Enter a valid 10-digit mobile number")
    if await db.fetchval("SELECT role FROM users WHERE phone = $1", phone) == "admin":
        raise ApiError(400, "That number belongs to an admin")
    u = await db.fetchrow(
        """INSERT INTO users (phone, name, role) VALUES ($1, $2, 'delivery')
           ON CONFLICT (phone) DO UPDATE SET name = $2, role = 'delivery' RETURNING *""",
        phone, name,
    )
    return {"id": u["id"], "name": u["name"], "phone": u["phone"], "activeOrders": 0}


@router.delete("/staff/{user_id}")
async def remove_staff(user_id: int):
    await db.execute("UPDATE users SET role = 'customer' WHERE id = $1 AND role = 'delivery'", user_id)
    return {"ok": True}


# ---------- Slots ----------

def to_slot(s) -> dict:
    return {"id": s["id"], "label": s["label"], "startHour": s["start_hour"], "endHour": s["end_hour"],
            "capacity": s["capacity"], "active": s["active"], "kind": s["kind"], "minutes": s["minutes"], "fee": s["fee"],
            "bookUntil": s["book_until"]}


def _quarter(h) -> float:
    """Hours as a number on the quarter hour (time pickers send 5.5 for 5:30)."""
    value = float(h)
    if abs(value * 4 - round(value * 4)) > 1e-6:
        raise ApiError(400, "Use times on the quarter hour, e.g. 5:00, 5:15, 5:30 or 5:45")
    return round(value * 4) / 4


def check_window(start: float, end: float) -> None:
    lo, hi = settings.slots_from, settings.slots_until
    if start < lo or end > hi:
        raise ApiError(400, f"Slots must be between {format_hour(lo)} and {format_hour(hi)}")
    if end <= start:
        raise ApiError(400, "The slot must end after it starts")


def slot_fields(b: dict) -> dict:
    try:
        start, end, capacity = _quarter(b.get("startHour")), _quarter(b.get("endHour")), int(b.get("capacity"))
        fee = float(b.get("fee") or 0)
    except (TypeError, ValueError):
        raise ApiError(400, "Enter the times, capacity and fee")
    kind = "express" if b.get("kind") == "express" else "scheduled"
    minutes = None
    if kind == "express":
        try:
            minutes = int(b.get("minutes"))
        except (TypeError, ValueError):
            raise ApiError(400, "Enter how many minutes express delivery takes")
        if not 10 <= minutes <= 240:
            raise ApiError(400, "Express delivery time must be between 10 and 240 minutes")
    check_window(start, end)
    book_until = "end" if kind == "scheduled" and b.get("bookUntil") == "end" else "start"
    label = str(b.get("label") or "").strip()[:30] or (
        f"Express · in {minutes} min" if kind == "express"
        else f"Anytime · {format_range(start, end)}" if book_until == "end" else format_range(start, end))
    if kind == "express" and (end - start) * 60 <= minutes:
        raise ApiError(400, "Express hours must be longer than the delivery time")
    if capacity < 0 or fee < 0:
        raise ApiError(400, "Capacity and fee must be zero or more")
    return {"label": label, "start": start, "end": end, "capacity": capacity,
            "active": b.get("active", True) is not False, "kind": kind, "minutes": minutes, "fee": fee,
            "bookUntil": book_until}


@router.get("/slots/window")
async def slot_window():
    return {"from": settings.slots_from, "until": settings.slots_until, "cutoffHours": settings.slot_cutoff_hours}


@router.get("/slots")
async def list_slots():
    """Every slot with today's and tomorrow's bookings and whether customers can still pick it today."""
    today, tomorrow = shop_date(0), shop_date(1)
    booked = await booked_counts([today, tomorrow])
    now = shop_hour_now()
    result = []
    for s in await db.fetch("SELECT * FROM slots ORDER BY kind = 'express' DESC, start_hour"):
        express = is_express(s)
        open_today = s["active"] and (express_open_now(s, now) if express else scheduled_open_today(s, now))
        result.append({
            **to_slot(s),
            "today": {"booked": booked.get((s["id"], today), 0), "open": open_today,
                      "orderBy": format_hour(s["end_hour"] if express else order_cutoff(s)),
                      "opensAt": format_hour(s["start_hour"]) if express else None},
            "tomorrow": {"booked": 0 if express else booked.get((s["id"], tomorrow), 0)},
        })
    return result


@router.post("/slots", status_code=201)
async def add_slot(body: dict = Body(default={})):
    f = slot_fields(body)
    s = await db.fetchrow(
        """INSERT INTO slots (label, start_hour, end_hour, capacity, active, kind, minutes, fee, book_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *""",
        f["label"], f["start"], f["end"], f["capacity"], f["active"], f["kind"], f["minutes"], f["fee"], f["bookUntil"],
    )
    return to_slot(s)


@router.post("/slots/generate", status_code=201)
async def generate_slots(body: dict = Body(default={})):
    """Creates back-to-back slots, e.g. 5 AM to 12 AM every 2 hours. Slots that already exist are skipped."""
    anytime = bool(body.get("anytime"))
    try:
        start, end = _quarter(body.get("from")), _quarter(body.get("until"))
        # An anytime slot is one window covering the whole time, so it needs no slot length.
        every = end - start if anytime else _quarter(body.get("every"))
        capacity, fee = int(body.get("capacity")), float(body.get("fee") or 0)
    except (TypeError, ValueError):
        raise ApiError(400, "Enter from, until, slot length and capacity")
    check_window(start, end)
    if every < 0.5 or every > end - start:
        raise ApiError(400, "Slot length must be at least 30 minutes and fit between From and Until")
    if capacity < 0 or fee < 0:
        raise ApiError(400, "Capacity and fee must be zero or more")
    existing = {(float(s["start_hour"]), float(s["end_hour"]))
                for s in await db.fetch("SELECT start_hour, end_hour FROM slots WHERE kind = 'scheduled'")}
    created, t = [], start
    async with db.transaction() as c:
        while t + every <= end + 1e-9:
            if (t, t + every) not in existing:
                created.append(to_slot(await c.fetchrow(
                    """INSERT INTO slots (label, start_hour, end_hour, capacity, active, kind, fee, book_until)
                       VALUES ($1, $2, $3, $4, true, 'scheduled', $5, $6) RETURNING *""",
                    (f"Anytime · {format_range(t, t + every)}" if anytime else format_range(t, t + every)),
                    t, t + every, capacity, fee, "end" if anytime else "start",
                )))
            t += every
    if not created:
        raise ApiError(409, "Those slots already exist")
    return created


@router.delete("/slots/{slot_id}")
async def delete_slot(slot_id: int):
    used = await db.fetchval("SELECT count(*) FROM orders WHERE slot_id = $1", slot_id)
    if used:
        raise ApiError(409, f"This slot has {used} orders, so it can't be deleted. Switch it to Closed instead.")
    await db.execute("DELETE FROM slots WHERE id = $1", slot_id)
    return {"ok": True}


@router.put("/slots/{slot_id}")
async def edit_slot(slot_id: int, body: dict = Body(default={})):
    f = slot_fields(body)
    s = await db.fetchrow(
        """UPDATE slots SET label = $2, start_hour = $3, end_hour = $4, capacity = $5, active = $6,
                  kind = $7, minutes = $8, fee = $9, book_until = $10
           WHERE id = $1 RETURNING *""",
        slot_id, f["label"], f["start"], f["end"], f["capacity"], f["active"], f["kind"], f["minutes"], f["fee"],
        f["bookUntil"],
    )
    if not s:
        raise ApiError(404, "Slot not found")
    return to_slot(s)
