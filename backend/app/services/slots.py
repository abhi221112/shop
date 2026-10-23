from .. import db
from ..config import settings
from ..util import format_hour, shop_date, shop_hour_now


def is_express(slot) -> bool:
    return slot["kind"] == "express"


def express_open_now(slot, now: float) -> bool:
    """Express slots take orders between start_hour and (end_hour − delivery time), today only."""
    return slot["start_hour"] <= now < slot["end_hour"] - (slot["minutes"] or 30) / 60


def is_anytime(slot) -> bool:
    return slot["kind"] != "express" and slot["book_until"] == "end"


def order_cutoff(slot) -> float:
    """Last hour customers can book this slot for today: before it starts, or before it ends for anytime windows."""
    ref = slot["end_hour"] if is_anytime(slot) else slot["start_hour"]
    return float(ref) - settings.slot_cutoff_hours


def scheduled_open_today(slot, now: float) -> bool:
    return now < order_cutoff(slot)


async def booked_counts(dates: list) -> dict:
    rows = await db.fetch(
        """SELECT slot_id, slot_date, count(*) AS n FROM orders
           WHERE slot_date = ANY($1::date[]) AND status <> 'cancelled' GROUP BY slot_id, slot_date""",
        dates,
    )
    return {(r["slot_id"], r["slot_date"]): r["n"] for r in rows}


async def upcoming_slots() -> list[dict]:
    """Bookable slots: express (today, while open) first, then scheduled slots for today and tomorrow.
    Slots past their order cutoff are left out; full ones are flagged."""
    today, tomorrow = shop_date(0), shop_date(1)
    slots = await db.fetch("SELECT * FROM slots WHERE active ORDER BY kind = 'express' DESC, start_hour")
    booked = await booked_counts([today, tomorrow])
    now = shop_hour_now()

    result = []
    for s in slots:
        if not is_express(s):
            continue
        if express_open_now(s, now):
            result.append({
                "slotId": s["id"], "date": today.isoformat(), "day": "Today", "label": s["label"],
                "express": True, "minutes": s["minutes"], "fee": s["fee"],
                "orderBy": format_hour(s["end_hour"]),
                "full": booked.get((s["id"], today), 0) >= s["capacity"],
            })
    for day, name in ((today, "Today"), (tomorrow, "Tomorrow")):
        for s in slots:
            if is_express(s) or (name == "Today" and not scheduled_open_today(s, now)):
                continue
            result.append({
                "slotId": s["id"], "date": day.isoformat(), "day": name, "label": s["label"],
                "express": False, "anytime": is_anytime(s), "minutes": None, "fee": s["fee"],
                "orderBy": format_hour(order_cutoff(s)),
                "full": booked.get((s["id"], day), 0) >= s["capacity"],
            })
    return result
