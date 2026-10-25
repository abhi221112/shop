from . import db
from .config import settings
from .util import normalize_phone

# Starting catalogue from the design. Edit prices and stock from Admin › Prices & stock.
PRODUCTS = [
    ("Tomato", "टमाटर", "Everyday", "kg", 0.25, 40, 22, "#F7DCD5"),
    ("Onion", "प्याज़", "Roots", "kg", 0.5, 35, 40, "#EEDFEA"),
    ("Potato", "आलू", "Roots", "kg", 1, 30, 55, "#F1E3CC"),
    ("Spinach", "पालक", "Leafy", "bunch", 1, 20, 30, "#DCEBD8"),
    ("Lady finger", "भिंडी", "Everyday", "kg", 0.25, 60, 3, "#E4EED5"),
    ("Coriander", "धनिया", "Leafy", "bunch", 1, 10, 6, "#DCEBD8"),
    ("Fenugreek", "मेथी", "Leafy", "bunch", 1, 15, 20, "#DCEBD8"),
    ("Carrot", "गाजर", "Roots", "kg", 0.5, 50, 18, "#FBDCC4"),
    ("Bottle gourd", "लौकी", "Everyday", "piece", 1, 30, 15, "#E4EED5"),
    ("Cauliflower", "गोभी", "Everyday", "piece", 1, 30, 12, "#F1EEE4"),
    ("Green chilli", "हरी मिर्च", "Everyday", "kg", 0.1, 80, 4, "#DCEBD8"),
    ("Ginger", "अदरक", "Roots", "kg", 0.1, 120, 1, "#F1E3CC"),
    ("Banana", "केला", "Fruits", "piece", 6, 6, 120, "#FBEBC0"),
    ("Papaya", "पपीता", "Fruits", "piece", 1, 45, 10, "#FBDCC4"),
    ("Broccoli", "ब्रोकली", "Exotic", "piece", 1, 70, 8, "#E4EED5"),
    ("Zucchini", "ज़ुकीनी", "Exotic", "kg", 0.25, 120, 5, "#E4EED5"),
]

# Local names used to be written in English letters. Shops seeded back then get the Hindi ones,
# unless the name was changed in Admin since.
OLD_LOCAL_NAMES = {
    "Tomato": "Tamatar", "Onion": "Pyaz", "Potato": "Aloo", "Spinach": "Palak", "Lady finger": "Bhindi",
    "Coriander": "Dhaniya", "Fenugreek": "Methi", "Carrot": "Gajar", "Bottle gourd": "Lauki",
    "Cauliflower": "Gobhi", "Green chilli": "Hari mirch", "Ginger": "Adrak", "Banana": "Kela",
    "Papaya": "Papita", "Broccoli": "", "Zucchini": "",
}

SLOTS = [("7 – 9 AM", 7, 9, 20), ("5 – 7 PM", 17, 19, 25), ("7 – 9 PM", 19, 21, 15)]


async def seed() -> None:
    await db.execute(
        """INSERT INTO users (phone, name, role) VALUES ($1, 'Shop owner', 'admin')
           ON CONFLICT (phone) DO UPDATE SET role = 'admin'""",
        # Same format as login, so "+91 98765 43210" in ADMIN_PHONE matches "9876543210".
        normalize_phone(settings.admin_phone) or settings.admin_phone,
    )
    async with db.transaction() as c:
        await c.executemany(
            "UPDATE products SET local_name = $3 WHERE name = $1 AND local_name = $2",
            [(name, OLD_LOCAL_NAMES[name], local) for name, local, *_ in PRODUCTS],
        )
    # Express delivery slot (added after first release): created once, switched off until you open it in Admin.
    await db.execute(
        """INSERT INTO slots (label, start_hour, end_hour, capacity, active, kind, minutes, fee)
           SELECT 'Express · in 30 min', 8, 20, 30, false, 'express', 30, 30
           WHERE NOT EXISTS (SELECT 1 FROM slots WHERE kind = 'express')"""
    )
    if await db.fetchval("SELECT count(*) FROM products"):
        return

    print("Seeding starter catalogue, slots and a demo delivery person…", flush=True)
    async with db.transaction() as c:
        for name, local, category, unit, step, price, stock, tint in PRODUCTS:
            await c.execute(
                """INSERT INTO products (name, local_name, category, unit, step, price, yesterday_price, stock, tint, low_stock_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)""",
                name, local, category, unit, step, price, stock, tint, 5 if unit == "kg" else 8,
            )
        for label, start, end, capacity in SLOTS:
            await c.execute(
                "INSERT INTO slots (label, start_hour, end_hour, capacity) VALUES ($1, $2, $3, $4)",
                label, start, end, capacity,
            )
        await c.execute(
            "INSERT INTO users (phone, name, role) VALUES ('8888888888', 'Ravi', 'delivery') ON CONFLICT (phone) DO NOTHING"
        )
