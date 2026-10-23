"""UPI payments through Razorpay when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set.

Without keys the gateway runs in "mock" mode: the app shows a test payment step and the
order is marked paid, so the whole flow can be tried locally.
"""
import hashlib
import hmac
import time

import httpx

from ..config import settings
from ..util import ApiError


def payment_mode() -> str:
    return "razorpay" if settings.razorpay_key_id and settings.razorpay_key_secret else "mock"


async def create_gateway_order(order: dict) -> dict:
    if payment_mode() == "mock":
        return {"mode": "mock", "amount": order["total"]}

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            "https://api.razorpay.com/v1/orders",
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            json={"amount": round(order["total"] * 100), "currency": "INR", "receipt": order["code"]},
        )
    if res.status_code >= 400:
        print("Razorpay order failed", res.status_code, res.text, flush=True)
        raise ApiError(502, "Could not start the UPI payment. Please try again.")
    return {
        "mode": "razorpay",
        "keyId": settings.razorpay_key_id,
        "gatewayOrderId": res.json()["id"],
        "amount": order["total"],
        "shopName": settings.shop_name,
    }


def verify_gateway_payment(gateway_order_id: str | None, body: dict) -> str:
    """Checks the Razorpay checkout signature. Returns the payment id when valid."""
    if payment_mode() == "mock":
        if not body.get("mock"):
            raise ApiError(400, "Invalid payment")
        return f"mock_{int(time.time())}"

    order_id = body.get("razorpay_order_id")
    payment_id = body.get("razorpay_payment_id")
    signature = str(body.get("razorpay_signature") or "")
    if not order_id or not payment_id or not signature or order_id != gateway_order_id:
        raise ApiError(400, "Invalid payment")
    expected = hmac.new(settings.razorpay_key_secret.encode(), f"{order_id}|{payment_id}".encode(),
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ApiError(400, "Payment could not be verified")
    return payment_id
