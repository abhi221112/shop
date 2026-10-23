from fastapi import APIRouter, Body, Depends, Request

from .. import db
from ..auth import current_user
from ..services import notify
from ..services import complaints
from ..services.orders import can_view, change_status, create_order, find_orders, get_order
from ..services.payments import create_gateway_order, verify_gateway_payment
from ..util import ApiError

router = APIRouter(prefix="/api/orders", tags=["orders"])


async def own_order(order_id: int, user) -> dict:
    order = await get_order(order_id)
    if not can_view(user, order):
        raise ApiError(404, "Order not found")
    return order


@router.post("", status_code=201)
async def place_order(body: dict = Body(default={}), user=Depends(current_user)):
    if not user["name"]:
        raise ApiError(400, "Add your name in Account before ordering")
    return await create_order(user, body)


@router.get("/mine")
async def my_orders(user=Depends(current_user)):
    return await find_orders("o.user_id = $1", user["id"])


@router.get("/{order_id}")
async def order_detail(order_id: int, user=Depends(current_user)):
    order = await own_order(order_id, user)
    # Only the customer sees the delivery code, and only while the order is on its way.
    if order["userId"] == user["id"] and order["status"] == "out":
        order["deliveryCode"] = await db.fetchval("SELECT delivery_code FROM orders WHERE id = $1", order_id)
    return order


@router.post("/{order_id}/complaints", status_code=201)
async def report_problem(order_id: int, request: Request, user=Depends(current_user)):
    """Customer reports bad items with 1–3 photos; the shop checks and may refund to the wallet."""
    order = await own_order(order_id, user)
    if order["userId"] != user["id"]:
        raise ApiError(403, "Only the customer can report a problem")
    form = await request.form()
    try:
        item_ids = [int(x) for x in str(form.get("items") or "").split(",") if x.strip()]
    except ValueError:
        raise ApiError(400, "Pick the items that were not good")
    await complaints.create(order, user, str(form.get("text") or ""), item_ids, form.getlist("photos"))
    return await get_order(order_id)


@router.post("/{order_id}/pay")
async def start_payment(order_id: int, user=Depends(current_user)):
    """Starts (or restarts) the UPI payment for an unpaid order."""
    order = await own_order(order_id, user)
    if order["userId"] != user["id"]:
        raise ApiError(403, "Only the customer can pay for this order")
    if order["paymentMethod"] != "upi" or order["paymentStatus"] == "paid" or order["status"] != "new":
        raise ApiError(409, "This order does not need a payment")
    payment = await create_gateway_order(order)
    if payment.get("gatewayOrderId"):
        await db.execute("UPDATE orders SET gateway_order_id = $2 WHERE id = $1", order_id, payment["gatewayOrderId"])
    return payment


@router.post("/{order_id}/pay/verify")
async def verify_payment(order_id: int, body: dict = Body(default={}), user=Depends(current_user)):
    await own_order(order_id, user)
    raw = await db.fetchrow("SELECT * FROM orders WHERE id = $1", order_id)
    if raw["payment_status"] == "paid":
        return await get_order(order_id)
    if raw["status"] != "new":
        raise ApiError(409, "This order was cancelled. Please place a new order.")
    payment_id = verify_gateway_payment(raw["gateway_order_id"], body)
    await db.execute(
        "UPDATE orders SET payment_status = 'paid', gateway_payment_id = $2, updated_at = now() WHERE id = $1",
        order_id, payment_id,
    )
    order = await get_order(order_id)
    await notify.order_status(order)
    return order


@router.post("/{order_id}/cancel")
async def cancel_order(order_id: int, user=Depends(current_user)):
    order = await own_order(order_id, user)
    if order["userId"] != user["id"] or order["status"] != "new":
        raise ApiError(409, "This order can no longer be cancelled from the app. Please call the shop.")
    return await change_status(order_id, "cancelled", "customer")
