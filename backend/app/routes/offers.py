"""Customer-facing offers: combo packs, cart pricing, and the referral wallet."""
from fastapi import APIRouter, Body, Depends

from .. import db
from ..auth import current_user, optional_user
from ..config import settings
from ..services.cart import first_order_eligible
from ..services.combos import list_combos
from ..services.offers import get_offers
from ..services.orders import quote
from ..services.referral import ensure_code
from ..services.wallet import summary as wallet_summary

router = APIRouter(prefix="/api", tags=["offers"])


@router.get("/combos")
async def combos():
    if not (await get_offers())["combos"]["enabled"]:
        return []
    return [c for c in await list_combos(active_only=True) if c["items"]]


@router.post("/cart/quote")
async def cart_quote(body: dict = Body(default={}), user=Depends(optional_user)):
    return await quote(user, body)


@router.get("/me/perks")
async def perks(user=Depends(current_user)):
    """What this customer can get: first-order offer, wallet balance, referral code and history."""
    offers = await get_offers()
    async with db.pool.acquire() as c:
        first = await first_order_eligible(c, user["id"])
    code = await ensure_code(user) if offers["referral"]["enabled"] else None
    friends = await db.fetchrow(
        "SELECT count(*) AS joined, count(*) FILTER (WHERE referral_rewarded) AS ordered FROM users WHERE referred_by = $1",
        user["id"],
    )
    txns = await db.fetch(
        "SELECT amount, reason, created_at FROM wallet_txns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
        user["id"],
    )
    w = await wallet_summary(user["id"])
    return {
        "firstOrderEligible": first,
        "wallet": w["balance"],
        "walletUsablePerOrder": w["usablePerOrder"],
        "walletCredits": w["credits"],
        "refunds": offers["refunds"],
        "referral": {
            "enabled": offers["referral"]["enabled"], "code": code, "amount": offers["referral"]["amount"],
            "shareUrl": f"{settings.shop_url}/?ref={code}" if code and settings.shop_url else None,
            "friendsJoined": friends["joined"], "friendsOrdered": friends["ordered"],
        },
        "walletHistory": [{"amount": t["amount"], "reason": t["reason"], "at": t["created_at"].isoformat()} for t in txns],
    }
