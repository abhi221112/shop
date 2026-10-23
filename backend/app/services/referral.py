"""Refer-a-friend: the new customer gets wallet credit at sign-up, the referrer gets credit when that
friend's first order is delivered. Wallet credit is spent automatically at checkout."""
import re
import secrets

from .. import db
from .wallet import add_credit


async def ensure_code(user) -> str:
    """Short shareable code like PRIYA482; created the first time someone opens Refer & earn."""
    if user["referral_code"]:
        return user["referral_code"]
    stem = re.sub(r"[^A-Za-z]", "", user["name"] or "")[:5].upper() or "VEG"
    for _ in range(20):
        code = f"{stem}{secrets.randbelow(900) + 100}"
        if await db.fetchval(
            "UPDATE users SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL "
            "AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = $2) RETURNING referral_code",
            user["id"], code,
        ):
            return code
    raise RuntimeError("Could not create a referral code")


async def apply_signup_referral(conn, new_user_id: int, code: str, offers: dict) -> bool:
    ref = offers["referral"]
    if not ref["enabled"] or not code:
        return False
    referrer = await conn.fetchval(
        "SELECT id FROM users WHERE upper(referral_code) = upper($1) AND id <> $2", code.strip(), new_user_id
    )
    if not referrer:
        return False
    await conn.execute("UPDATE users SET referred_by = $2 WHERE id = $1", new_user_id, referrer)
    await add_credit(conn, new_user_id, float(ref["amount"]), "Welcome credit from a friend's referral", kind="referral")
    return True


async def reward_referrer(conn, user_id: int, order_id: int, offers: dict):
    """Called inside the transaction that marks an order delivered. Returns (referrer phone, amount) or None."""
    ref = offers["referral"]
    u = await conn.fetchrow(
        "SELECT referred_by, referral_rewarded, name FROM users WHERE id = $1 FOR UPDATE", user_id
    )
    if not ref["enabled"] or not u or not u["referred_by"] or u["referral_rewarded"]:
        return None
    await conn.execute("UPDATE users SET referral_rewarded = true WHERE id = $1", user_id)
    amount = float(ref["amount"])
    await add_credit(conn, u["referred_by"], amount, f"Referral reward: {u['name'] or 'your friend'}'s first order",
                     kind="referral", order_id=order_id)
    phone = await conn.fetchval("SELECT phone FROM users WHERE id = $1", u["referred_by"])
    return phone, amount
