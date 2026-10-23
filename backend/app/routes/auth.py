import secrets

from fastapi import APIRouter, Body, Depends

from .. import db
from ..auth import current_user, public_user, sign_token
from ..config import settings
from ..services import notify
from ..services.offers import get_offers
from ..services.referral import apply_signup_referral
from ..util import ApiError, normalize_phone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/otp")
async def request_otp(body: dict = Body(default={})):
    phone = normalize_phone(body.get("phone"))
    if not phone:
        raise ApiError(400, "Enter a valid 10-digit mobile number")
    if await db.fetchval(
        "SELECT 1 FROM otp_codes WHERE phone = $1 AND created_at > now() - interval '30 seconds'", phone
    ):
        raise ApiError(429, "Please wait 30 seconds before asking for another code")

    code = str(secrets.randbelow(9000) + 1000)
    await db.execute(
        """INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
           ON CONFLICT (phone) DO UPDATE
           SET code = $2, attempts = 0, created_at = now(), expires_at = now() + interval '10 minutes'""",
        phone, code,
    )
    await notify.otp(phone, code)
    return {"ok": True, **({"devCode": code} if settings.otp_dev_mode else {})}


@router.post("/verify")
async def verify_otp(body: dict = Body(default={})):
    phone = normalize_phone(body.get("phone"))
    code = str(body.get("code") or "").strip()
    name = str(body.get("name") or "").strip()[:80]
    if not phone:
        raise ApiError(400, "Enter a valid 10-digit mobile number")

    otp = await db.fetchrow("SELECT *, expires_at < now() AS expired FROM otp_codes WHERE phone = $1", phone)
    if not otp or otp["expired"]:
        raise ApiError(400, "This code has expired. Please ask for a new one.")
    if otp["attempts"] >= 5:
        raise ApiError(429, "Too many wrong codes. Please ask for a new one.")
    if not secrets.compare_digest(otp["code"], code):
        await db.execute("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1", phone)
        raise ApiError(400, "That code is not right")
    await db.execute("DELETE FROM otp_codes WHERE phone = $1", phone)

    async with db.transaction() as c:
        is_new = not await c.fetchval("SELECT 1 FROM users WHERE phone = $1", phone)
        user = await c.fetchrow(
            """INSERT INTO users (phone, name) VALUES ($1, $2)
               ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF($2, ''), users.name) RETURNING *""",
            phone, name,
        )
        # A friend's referral code only counts for brand-new customers.
        referred = is_new and await apply_signup_referral(c, user["id"], str(body.get("ref") or ""), await get_offers(c))
    return {"token": sign_token(user), "user": public_user(user), "referred": bool(referred)}


@router.get("/me")
async def me(user=Depends(current_user)):
    return public_user(user)


@router.patch("/me")
async def update_me(body: dict = Body(default={}), user=Depends(current_user)):
    name = str(body.get("name") or "").strip()[:80]
    if not name:
        raise ApiError(400, "Enter your name")
    updated = await db.fetchrow("UPDATE users SET name = $2 WHERE id = $1 RETURNING *", user["id"], name)
    return public_user(updated)
