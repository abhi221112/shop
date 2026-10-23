from . import db
from .config import settings

# Starting catalogue from the design. Edit prices and stock from Admin › Prices & stock.
PRODUCTS = [
    ("Tomato", "Tamatar", "Everyday", "kg", 0.25, 40, 22, "#F7DCD5"),
    ("Onion", "Pyaz", "Roots", "kg", 0.5, 35, 40, "#EEDFEA"),
    ("Potato", "Aloo", "Roots", "kg", 1, 30, 55, "#F1E3CC"),
    ("Spinach", "Palak", "Leafy", "bunch", 1, 20, 30, "#DCEBD8"),
    ("Lady finger", "Bhindi", "Everyday", "kg", 0.25, 60, 3, "#E4EED5"),
    ("Coriander", "Dhaniya", "Leafy", "bunch", 1, 10, 6, "#DCEBD8"),
    ("Fenugreek", "Methi", "Leafy", "bunch", 1, 15, 20, "#DCEBD8"),
    ("Carrot", "Gajar", "Roots", "kg", 0.5, 50, 18, "#FBDCC4"),
    ("Bottle gourd", "Lauki", "Everyday", "piece", 1, 30, 15, "#E4EED5"),
    ("Cauliflower", "Gobhi", "Everyday", "piece", 1, 30, 12, "#F1EEE4"),
    ("Green chilli", "Hari mirch", "Everyday", "kg", 0.1, 80, 4, "#DCEBD8"),
    ("Ginger", "Adrak", "Roots", "kg", 0.1, 120, 1, "#F1E3CC"),
    ("Banana", "Kela", "Fruits", "piece", 6, 6, 120, "#FBEBC0"),
    ("Papaya", "Papita", "Fruits", "piece", 1, 45, 10, "#FBDCC4"),
    ("Broccoli", "", "Exotic", "piece", 1, 70, 8, "#E4EED5"),
    ("Zucchini", "", "Exotic", "kg", 0.25, 120, 5, "#E4EED5"),
]

SLOTS = [("7 – 9 AM", 7, 9, 20), ("5 – 7 PM", 17, 19, 25), ("7 – 9 PM", 19, 21, 15)]


async def seed() -> None:
    await db.execute(
        """INSERT INTO users (phone, name, role) VALUES ($1, 'Shop owner', 'admin')
           ON CONFLICT (phone) DO UPDATE SET role = 'admin'""",
        settings.admin_phone,
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
