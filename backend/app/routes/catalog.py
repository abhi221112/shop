from fastapi import APIRouter

from .. import db
from ..config import settings
from ..services.offers import get_offers
from ..services.payments import payment_mode
from ..services.slots import upcoming_slots
from ..util import is_serviceable, to_product

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/health")
async def health():
    await db.fetchval("SELECT 1")
    return {"ok": True}


@router.get("/config")
async def shop_config():
    offers = await get_offers()
    fd = offers["freeDelivery"]
    return {
        "shopName": settings.shop_name,
        "shopPhone": settings.shop_phone,
        "shopAddress": settings.shop_address,
        "shopUrl": settings.shop_url,
        "deliveryFee": settings.delivery_fee,
        "freeDeliveryMin": fd["min"] if fd["enabled"] else None,
        "paymentMode": payment_mode(),
        "offers": offers,
    }


@router.get("/pincode/{pin}")
async def check_pincode(pin: str):
    return {"pincode": pin, "serviceable": is_serviceable(pin)}


@router.get("/products")
async def products():
    rows = await db.fetch("SELECT * FROM products WHERE active ORDER BY category, name")
    updated = await db.fetchval("SELECT max(updated_at) FROM products")
    return {"updatedAt": updated.isoformat() if updated else None, "products": [to_product(r) for r in rows]}


@router.get("/slots")
async def slots():
    return await upcoming_slots()
