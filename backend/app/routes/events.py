"""Customer side of event orders (wedding, anniversary…)."""
from fastapi import APIRouter, Body, Depends

from ..auth import current_user
from ..services import events
from ..util import ApiError

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("", status_code=201)
async def request_event(body: dict = Body(default={}), user=Depends(current_user)):
    if not user["name"]:
        raise ApiError(400, "Add your name in Account before sending a request")
    return await events.create(user, body)


@router.get("/mine")
async def my_requests(user=Depends(current_user)):
    return await events.mine(user["id"])
