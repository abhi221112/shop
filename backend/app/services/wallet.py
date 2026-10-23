"""Customer wallet.

Every credit is its own row with what's left (`remaining`) and an optional limit per order
(`per_order_cap`). Refunds carry a limit so they are spread over several orders; referral and
welcome credit have none. `users.wallet` is kept equal to the sum of what's left, and every
movement is written to `wallet_txns` for the customer's history.
"""
import math

from .. import db


async def _log(conn, user_id: int, amount: float, reason: str, order_id: int | None) -> None:
    await conn.execute("UPDATE users SET wallet = wallet + $2 WHERE id = $1", user_id, amount)
    await conn.execute(
        "INSERT INTO wallet_txns (user_id, amount, reason, order_id) VALUES ($1, $2, $3, $4)",
        user_id, amount, reason, order_id,
    )


def spread_cap(amount: float, orders: int) -> float | None:
    """Most of a refund one order may use: ₹90 over 3 orders -> ₹30. Rounded up so it's all usable."""
    return None if orders <= 1 else float(math.ceil(amount / orders))


async def add_credit(conn, user_id: int, amount: float, reason: str, *, kind: str = "other",
                     per_order_cap: float | None = None, order_id: int | None = None) -> None:
    if amount <= 0:
        return
    await conn.execute(
        """INSERT INTO wallet_credits (user_id, kind, amount, remaining, per_order_cap, reason)
           VALUES ($1, $2, $3, $3, $4, $5)""",
        user_id, kind, amount, per_order_cap, reason,
    )
    await _log(conn, user_id, amount, reason, order_id)


async def _credits(conn, user_id: int, lock: bool = False):
    # Limited credits (refunds) first so they get used up over time; oldest first within each group.
    return await conn.fetch(
        f"""SELECT * FROM wallet_credits WHERE user_id = $1 AND remaining > 0
            ORDER BY per_order_cap IS NULL, created_at, id{' FOR UPDATE' if lock else ''}""",
        user_id,
    )


def _usable_from(rows) -> float:
    return round(sum(min(float(r["remaining"]), float(r["per_order_cap"] or r["remaining"])) for r in rows), 2)


async def balance(conn, user_id: int, lock: bool = False) -> tuple[float, float]:
    """(usable on one order, total balance)."""
    rows = await _credits(conn, user_id, lock)
    return _usable_from(rows), round(sum(float(r["remaining"]) for r in rows), 2)


async def spend(conn, user_id: int, amount: float, order_id: int, order_code: str) -> None:
    """Takes `amount` (already limited to what's usable) from the credits, respecting each limit."""
    need = round(amount, 2)
    for r in await _credits(conn, user_id, lock=True):
        if need <= 0:
            break
        take = round(min(need, float(r["remaining"]), float(r["per_order_cap"] or r["remaining"])), 2)
        if take <= 0:
            continue
        await conn.execute("UPDATE wallet_credits SET remaining = remaining - $2 WHERE id = $1", r["id"], take)
        await conn.execute("INSERT INTO wallet_usage (order_id, credit_id, amount) VALUES ($1, $2, $3)", order_id, r["id"], take)
        need = round(need - take, 2)
    if need > 0.009:
        raise RuntimeError(f"Wallet short by {need} for order {order_code}")
    await _log(conn, user_id, -amount, f"Used on order {order_code}", order_id)


async def refund_order(conn, user_id: int, order_id: int, order_code: str) -> float:
    """Gives back what a cancelled order took, to the same credits (and so the same limits)."""
    rows = await conn.fetch("DELETE FROM wallet_usage WHERE order_id = $1 RETURNING credit_id, amount", order_id)
    total = round(sum(float(r["amount"]) for r in rows), 2)
    for r in rows:
        await conn.execute("UPDATE wallet_credits SET remaining = remaining + $2 WHERE id = $1", r["credit_id"], r["amount"])
    if total:
        await _log(conn, user_id, total, f"Refund for cancelled order {order_code}", order_id)
    return total


async def summary(user_id: int) -> dict:
    async with db.pool.acquire() as c:
        rows = await _credits(c, user_id)
    return {
        "usablePerOrder": _usable_from(rows),
        "balance": round(sum(float(r["remaining"]) for r in rows), 2),
        "credits": [{
            "kind": r["kind"], "reason": r["reason"], "amount": r["amount"], "remaining": r["remaining"],
            "perOrderCap": r["per_order_cap"], "at": r["created_at"].isoformat(),
        } for r in rows],
    }
