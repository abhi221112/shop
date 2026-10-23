import os


def _list(value: str | None) -> list[str]:
    return [s.strip() for s in (value or "").split(",") if s.strip()]


class Settings:
    production = os.getenv("ENV", "development") == "production"
    database_url = os.getenv("DATABASE_URL", "postgresql://shop:shop@localhost:5432/shop")
    jwt_secret = os.getenv("JWT_SECRET", "dev-secret-change-me")

    shop_name = os.getenv("SHOP_NAME", "My Vegetable Shop")
    shop_phone = os.getenv("SHOP_PHONE", "")
    shop_address = os.getenv("SHOP_ADDRESS", "")
    shop_url = os.getenv("SHOP_URL", "").rstrip("/")
    timezone = os.getenv("SHOP_TIMEZONE", "Asia/Kolkata")

    delivery_fee = float(os.getenv("DELIVERY_FEE", "20"))
    # Customers must order this many hours before a slot starts.
    slot_cutoff_hours = int(os.getenv("SLOT_CUTOFF_HOURS", "2"))
    # Earliest start and latest end for delivery slots (24 = midnight).
    slots_from = float(os.getenv("SLOTS_FROM", "5"))
    slots_until = float(os.getenv("SLOTS_UNTIL", "24"))
    # Empty list = deliver to every pincode.
    pincodes = _list(os.getenv("SERVICE_PINCODES"))

    admin_phone = os.getenv("ADMIN_PHONE", "9999999999")
    # When true the OTP is returned by the API and printed in the logs instead of being sent by SMS.
    otp_dev_mode = os.getenv("OTP_DEV_MODE", "true").lower() != "false"

    razorpay_key_id = os.getenv("RAZORPAY_KEY_ID", "")
    razorpay_key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")

    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    # Browser origins allowed to call the API. "*" also covers the Android/iOS app (capacitor://, http://localhost).
    cors_origins = _list(os.getenv("CORS_ORIGINS", "*"))


settings = Settings()

if settings.production and settings.jwt_secret == "dev-secret-change-me":
    raise RuntimeError("Set JWT_SECRET before running in production.")
