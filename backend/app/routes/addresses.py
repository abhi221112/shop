import re

from fastapi import APIRouter, Body, Depends

from .. import db
from ..auth import current_user
from ..util import ApiError, is_serviceable

router = APIRouter(prefix="/api/addresses", tags=["addresses"])


def to_address(a) -> dict:
    return {"id": a["id"], "label": a["label"], "line": a["line"], "landmark": a["landmark"], "pincode": a["pincode"]}


@router.get("")
async def list_addresses(user=Depends(current_user)):
    rows = await db.fetch("SELECT * FROM addresses WHERE user_id = $1 ORDER BY id", user["id"])
    return [to_address(a) for a in rows]


@router.post("", status_code=201)
async def add_address(body: dict = Body(default={}), user=Depends(current_user)):
    label = str(body.get("label") or "Home").strip()[:30] or "Home"
    line = str(body.get("line") or "").strip()[:300]
    landmark = str(body.get("landmark") or "").strip()[:150]
    pincode = str(body.get("pincode") or "").strip()
    if not line:
        raise ApiError(400, "Enter your house number and street")
    if not re.fullmatch(r"\d{6}", pincode):
        raise ApiError(400, "Enter a 6-digit pincode")
    if not is_serviceable(pincode):
        raise ApiError(400, f"Sorry, we don't deliver to {pincode} yet")
    a = await db.fetchrow(
        "INSERT INTO addresses (user_id, label, line, landmark, pincode) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        user["id"], label, line, landmark, pincode,
    )
    return to_address(a)


@router.delete("/{address_id}")
async def delete_address(address_id: int, user=Depends(current_user)):
    await db.execute("DELETE FROM addresses WHERE id = $1 AND user_id = $2", address_id, user["id"])
    return {"ok": True}
