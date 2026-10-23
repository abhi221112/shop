from fastapi import APIRouter, Body, Depends

from ..auth import require_role
from ..services.orders import change_status, confirm_delivery, find_orders, get_order
from ..util import ApiError, parse_date, shop_date

router = APIRouter(prefix="/api/delivery", tags=["delivery"])
staff = require_role("delivery", "admin")


async def my_order(order_id: int, user) -> dict:
    order = await get_order(order_id)
    if user["role"] != "admin" and (not order["delivery"] or order["delivery"]["id"] != user["id"]):
        raise ApiError(404, "Order not found")
    return order


def who(user) -> str:
    return f"delivery: {user['name'] or user['phone']}"


@router.get("/orders")
async def my_orders(date: str | None = None, user=Depends(staff)):
    # Every order assigned to this person for the day, including ones the shop is still packing.
    return await find_orders(
        "o.delivery_user_id = $1 AND o.slot_date = $2 AND o.status <> 'cancelled'",
        user["id"], parse_date(date) or shop_date(),
        order_by="o.status = 'delivered', o.due_at IS NULL, o.due_at, s.start_hour, o.id",
    )


@router.get("/orders/{order_id}")
async def order_detail(order_id: int, user=Depends(staff)):
    return await my_order(order_id, user)


@router.post("/orders/{order_id}/pickup")
async def pickup(order_id: int, user=Depends(staff)):
    """Picking up a packed bag at the shop."""
    await my_order(order_id, user)
    return await change_status(order_id, "out", who(user))


@router.post("/orders/{order_id}/delivered")
async def delivered(order_id: int, body: dict = Body(default={}), user=Depends(staff)):
    """Needs the 4-digit code the customer reads out from their order page — proof they got the bag."""
    await my_order(order_id, user)
    return await confirm_delivery(order_id, body.get("code"), who(user), body.get("lat"), body.get("lng"))


@router.post("/orders/{order_id}/not-available")
async def not_available(order_id: int, user=Depends(staff)):
    await my_order(order_id, user)
    return await change_status(order_id, "not_available", who(user))
