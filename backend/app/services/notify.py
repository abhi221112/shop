"""Customer notifications.

Messages are printed to the API log for now. To go live, replace `send` with a call to your
SMS / WhatsApp provider (e.g. WhatsApp Cloud API, MSG91, Twilio) — every message goes through it.
"""
from ..config import settings


async def send(phone: str, text: str) -> None:
    print(f"[notify → {phone}] {text}", flush=True)


async def otp(phone: str, code: str) -> None:
    await send(phone, f"{code} is your {settings.shop_name} login code. It expires in 10 minutes.")


async def order_status(order: dict, delivery_code: str | None = None) -> None:
    code, total = order["code"], order["total"]
    refund = " Your UPI payment will be refunded." if order["paymentStatus"] == "paid" else ""
    messages = {
        "new": f"Order {code} placed. Total ₹{total:g}. We'll confirm it shortly.",
        "confirmed": f"Order {code} is confirmed by the shop.",
        "packed": f"Order {code} is packed and weighed.",
        "out": f"Order {code} is out for delivery. Your delivery code is {delivery_code}. "
               f"Share it with the delivery person only after you receive your order.",
        "delivered": f"Order {code} delivered. Thank you for shopping with {settings.shop_name}!",
        "not_available": f"We could not reach you for order {code}. The shop will call you to reschedule.",
        "cancelled": f"Order {code} was cancelled.{refund}",
    }
    if text := messages.get(order["status"]):
        await send(order["customerPhone"], text)
