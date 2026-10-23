"""Shop offers: settings the admin edits, and the bill calculation every price shown or charged goes through."""
import copy

from .. import db
from ..config import settings
from ..util import ApiError

DEFAULTS = {
    "freeDelivery": {"enabled": True, "min": 100},
    "freeGift": {"enabled": True, "min": 150, "item": "Dhaniya (1 bunch)"},
    "priceDrops": {"enabled": True},
    # type: "flat" (₹ off) or "free_delivery"; only on orders of at least `min`.
    "firstOrder": {"enabled": True, "type": "flat", "amount": 30, "min": 99},
    "referral": {"enabled": True, "amount": 30},
    "combos": {"enabled": True},
    "reorder": {"enabled": True},
    "lowStock": {"enabled": True},
    "promise": {"enabled": True, "text": "Fresh from the mandi at 6 AM · Weighed fairly · Not fresh? We replace it free"},
    "express": {"enabled": True},
    "banner": {"enabled": False, "title": "", "text": ""},
    # Bad-item reports: customers send photos within `windowDays`; approved refunds can be used
    # over `spreadOrders` orders (an equal share per order).
    "refunds": {"enabled": True, "windowDays": 3, "spreadOrders": 3},
}


def _merge(saved: dict | None) -> dict:
    merged = copy.deepcopy(DEFAULTS)
    for key, value in (saved or {}).items():
        if key in merged and isinstance(value, dict):
            merged[key].update({k: v for k, v in value.items() if k in merged[key]})
    return merged


async def get_offers(conn=None) -> dict:
    saved = await (conn or db).fetchval("SELECT value FROM shop_settings WHERE key = 'offers'")
    return _merge(saved)


def _money(v, name: str) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise ApiError(400, f"Enter a number for {name}")
    if n < 0 or n > 100000:
        raise ApiError(400, f"{name} must be between ₹0 and ₹1,00,000")
    return round(n, 2)


async def save_offers(body: dict) -> dict:
    o = _merge(body)
    for key in o:
        o[key]["enabled"] = bool(o[key].get("enabled"))
    o["freeDelivery"]["min"] = _money(o["freeDelivery"]["min"], "the free delivery amount")
    o["freeGift"]["min"] = _money(o["freeGift"]["min"], "the free gift amount")
    o["freeGift"]["item"] = str(o["freeGift"]["item"] or "").strip()[:60]
    if o["freeGift"]["enabled"] and not o["freeGift"]["item"]:
        raise ApiError(400, "Enter the free gift, e.g. Dhaniya (1 bunch)")
    if o["firstOrder"]["type"] not in ("flat", "free_delivery"):
        raise ApiError(400, "Choose ₹ off or free delivery for the first order offer")
    o["firstOrder"]["amount"] = _money(o["firstOrder"]["amount"], "the first order discount")
    o["firstOrder"]["min"] = _money(o["firstOrder"]["min"], "the first order minimum")
    if o["firstOrder"]["type"] == "flat" and o["firstOrder"]["amount"] > o["firstOrder"]["min"]:
        raise ApiError(400, "The first order discount can't be more than its minimum order")
    o["referral"]["amount"] = _money(o["referral"]["amount"], "the referral reward")
    try:
        o["refunds"]["windowDays"] = int(o["refunds"]["windowDays"])
        o["refunds"]["spreadOrders"] = int(o["refunds"]["spreadOrders"])
    except (TypeError, ValueError):
        raise ApiError(400, "Enter whole numbers for the refund rules")
    if not 1 <= o["refunds"]["windowDays"] <= 30:
        raise ApiError(400, "Customers can report problems for 1 to 30 days after delivery")
    if not 1 <= o["refunds"]["spreadOrders"] <= 20:
        raise ApiError(400, "Spread refunds over 1 to 20 orders")
    o["promise"]["text"] = str(o["promise"]["text"] or "").strip()[:160]
    o["banner"]["title"] = str(o["banner"]["title"] or "").strip()[:60]
    o["banner"]["text"] = str(o["banner"]["text"] or "").strip()[:160]
    await db.execute(
        """INSERT INTO shop_settings (key, value) VALUES ('offers', $1)
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()""",
        o,
    )
    return o


def compute_bill(items_total: float, combo_savings: float, offers: dict, *,
                 first_order: bool, wallet: float, slot_fee: float, wallet_balance: float | None = None) -> dict:
    """`wallet` is what this one order may use (refund credit is limited per order); `wallet_balance` the total."""
    # The one place prices are worked out: cart, checkout and the placed order all use this.
    goods = max(0.0, items_total - combo_savings)
    fd, fg, fo = offers["freeDelivery"], offers["freeGift"], offers["firstOrder"]
    first_eligible = fo["enabled"] and first_order
    first = first_eligible and goods >= fo["min"]

    free_by_min = fd["enabled"] and goods >= fd["min"]
    free_by_first = first and fo["type"] == "free_delivery"
    fee = 0.0 if goods == 0 or free_by_min or free_by_first else float(settings.delivery_fee)

    lines = []
    if combo_savings > 0:
        lines.append({"label": "Combo savings", "amount": combo_savings})
    first_discount = min(float(fo["amount"]), goods) if first and fo["type"] == "flat" else 0.0
    if first_discount > 0:
        lines.append({"label": "First order offer", "amount": first_discount})
    wallet_used = round(min(max(0.0, wallet), goods - first_discount), 2)
    if wallet_used > 0:
        lines.append({"label": "Wallet credit", "amount": wallet_used})

    total = goods - first_discount - wallet_used + fee + (slot_fee or 0)
    gift = fg["item"] if fg["enabled"] and goods >= fg["min"] and goods > 0 else None
    return {
        "itemsTotal": items_total,
        "comboSavings": combo_savings,
        "goods": goods,
        "deliveryFee": fee,
        "baseDeliveryFee": float(settings.delivery_fee),
        "freeDeliveryReason": "first_order" if free_by_first and not free_by_min else ("min" if free_by_min else None),
        "slotFee": float(slot_fee or 0),
        "firstOrderDiscount": first_discount,
        "firstOrderFreeDelivery": bool(free_by_first),
        "walletUsed": wallet_used,
        "walletBalance": max(0.0, wallet if wallet_balance is None else wallet_balance),
        "walletUsable": max(0.0, wallet),
        "discount": round(combo_savings + first_discount + wallet_used, 2),
        "discountLines": lines,
        "total": round(total, 2),
        "gift": gift,
        "nudges": {
            "freeDelivery": {"min": fd["min"], "remaining": round(fd["min"] - goods, 2)}
            if fd["enabled"] and not free_by_first and goods < fd["min"] else None,
            "gift": {"min": fg["min"], "item": fg["item"], "remaining": round(fg["min"] - goods, 2)}
            if fg["enabled"] and goods < fg["min"] else None,
            "firstOrder": {"min": fo["min"], "type": fo["type"], "amount": fo["amount"], "remaining": round(fo["min"] - goods, 2)}
            if first_eligible and not first else None,
        },
    }
