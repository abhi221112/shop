import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg

from .config import settings

pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    # NUMERIC as float, JSON/JSONB as Python objects.
    await conn.set_type_codec("numeric", encoder=str, decoder=float, schema="pg_catalog", format="text")
    for kind in ("json", "jsonb"):
        await conn.set_type_codec(kind, encoder=lambda v: json.dumps(v, default=str), decoder=json.loads,
                                  schema="pg_catalog")


async def connect() -> None:
    global pool
    for attempt in range(1, 31):
        try:
            pool = await asyncpg.create_pool(settings.database_url, init=_init_connection, min_size=1, max_size=10)
            break
        except (OSError, asyncpg.PostgresError):
            if attempt == 30:
                raise
            print(f"Waiting for database ({attempt})…", flush=True)
            await asyncio.sleep(2)
    async with pool.acquire() as conn:
        await conn.execute((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
    from .seed import seed
    await seed()


async def close() -> None:
    if pool:
        await pool.close()


async def fetch(sql: str, *args):
    return await pool.fetch(sql, *args)


async def fetchrow(sql: str, *args):
    return await pool.fetchrow(sql, *args)


async def fetchval(sql: str, *args):
    return await pool.fetchval(sql, *args)


async def execute(sql: str, *args):
    return await pool.execute(sql, *args)


@asynccontextmanager
async def transaction():
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn
