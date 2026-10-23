import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .config import settings


class ApiError(Exception):
    """An error whose message is safe to show to the user."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def normalize_phone(value) -> str | None:
    """10-digit Indian mobile number, or None. Accepts +91 / 91 / 0 prefixes and spaces."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if re.fullmatch(r"[6-9]\d{9}", digits) else None


def is_serviceable(pincode) -> bool:
    pincode = str(pincode or "")
    if not re.fullmatch(r"\d{6}", pincode):
        return False
    return not settings.pincodes or pincode in settings.pincodes


def _now() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone))


def shop_date(offset_days: int = 0) -> date:
    return _now().date() + timedelta(days=offset_days)


def shop_hour_now() -> float:
    now = _now()
    return now.hour + now.minute / 60


def parse_date(value) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def format_hour(h: float) -> str:
    """5 -> "5 AM", 17.5 -> "5:30 PM", 24 -> "12 AM" (midnight)."""
    total = round(float(h) * 60) % (24 * 60)
    hour, minute = divmod(total, 60)
    clock = f"{hour % 12 or 12}" + (f":{minute:02d}" if minute else "")
    return f"{clock} {'AM' if hour < 12 else 'PM'}"


def format_range(start: float, end: float) -> str:
    """Slot name from its times: "5 – 7 AM", "11 AM – 1 PM", "10 PM – 12 AM"."""
    a, b = format_hour(start), format_hour(end)
    if a[-2:] == b[-2:] and float(end) < 24:
        a = a[:-3]
    return f"{a} – {b}"


def format_qty(qty: float, unit: str) -> str:
    if unit == "kg":
        return f"{round(qty * 1000)} g" if qty < 1 else f"{qty:g} kg"
    word = ("bunch", "bunches") if unit == "bunch" else ("piece", "pieces")
    return f"{qty:g} {word[0] if qty == 1 else word[1]}"


def to_product(r) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "localName": r["local_name"],
        "category": r["category"],
        "unit": r["unit"],
        "step": r["step"],
        "price": r["price"],
        "yesterdayPrice": r["yesterday_price"],
        "stock": r["stock"],
        "lowStockAt": r["low_stock_at"],
        "lowStock": r["stock"] <= r["low_stock_at"],
        # Cheaper than yesterday, counted only when today's price was set today.
        "priceDrop": round(r["yesterday_price"] - r["price"], 2)
        if r["yesterday_price"] and r["yesterday_price"] > r["price"] and r["price_date"] == shop_date() else 0,
        "active": r["active"],
        "imageUrl": r["image_url"],
        "tint": r["tint"],
    }
