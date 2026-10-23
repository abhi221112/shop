from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header

from . import db
from .config import settings
from .util import ApiError


def public_user(u) -> dict:
    return {"id": u["id"], "phone": u["phone"], "name": u["name"], "role": u["role"]}


def sign_token(user) -> str:
    payload = {"sub": str(user["id"]), "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def current_user(authorization: str | None = Header(default=None)):
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else None
    if not token:
        raise ApiError(401, "Please log in")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "Your session has expired. Please log in again.")
    # Loaded from the database so role changes (e.g. removing a delivery person) apply immediately.
    user = await db.fetchrow("SELECT * FROM users WHERE id = $1", int(payload["sub"]))
    if not user:
        raise ApiError(401, "Please log in")
    return user


async def optional_user(authorization: str | None = Header(default=None)):
    """The logged-in user, or None for visitors (e.g. pricing a cart before login)."""
    if not authorization:
        return None
    try:
        return await current_user(authorization)
    except ApiError:
        return None


def require_role(*roles: str):
    async def check(user=Depends(current_user)):
        if user["role"] not in roles:
            raise ApiError(403, "You do not have access to this page")
        return user

    return check
