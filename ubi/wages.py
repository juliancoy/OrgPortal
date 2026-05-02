import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP, getcontext

import asyncpg
from asyncpg import exceptions as asyncpg_exceptions
from fastapi import Depends, FastAPI, Header, HTTPException

getcontext().prec = 28

COCKROACH_ASYNC_URL = os.environ.get("COCKROACH_ASYNC_URL", "")
DEFAULT_WAGES_INTERVAL_SECONDS = int(os.environ.get("WAGES_INTERVAL_SECONDS", "60"))
DEFAULT_WAGES_MAX_PAYMENTS_PER_TICK = int(os.environ.get("WAGES_MAX_PAYMENTS_PER_TICK", "500"))
DB_RETRY_BASE_SECONDS = float(os.environ.get("WAGES_DB_RETRY_BASE_SECONDS", "1"))
DB_RETRY_MAX_SECONDS = float(os.environ.get("WAGES_DB_RETRY_MAX_SECONDS", "30"))
WAGES_DB_POOL_MIN_SIZE = int(os.environ.get("WAGES_DB_POOL_MIN_SIZE", "1"))
WAGES_DB_POOL_MAX_SIZE = int(os.environ.get("WAGES_DB_POOL_MAX_SIZE", "1"))
WAGES_API_KEY = os.environ.get("WAGES_API_KEY", "")

MONEY_QUANT = Decimal("0.01")

db_pool: asyncpg.Pool | None = None
wages_task: asyncio.Task | None = None


def _money(value: object) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _reference_id(schedule_id: uuid.UUID, pay_period_end: datetime) -> str:
    period = pay_period_end.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"wage:{schedule_id}:{period}"


def _is_transient_db_error(exc: Exception) -> bool:
    return isinstance(
        exc,
        (
            OSError,
            ConnectionError,
            asyncpg_exceptions.InterfaceError,
            asyncpg_exceptions.InternalClientError,
            asyncpg_exceptions.PostgresConnectionError,
            asyncpg_exceptions.SerializationError,
            asyncpg_exceptions.DeadlockDetectedError,
        ),
    )


async def ensure_schema(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wage_runtime_settings (
            id INT PRIMARY KEY CHECK (id = 1),
            interval_seconds INT NOT NULL CHECK (interval_seconds > 0),
            max_payments_per_tick INT NOT NULL CHECK (max_payments_per_tick > 0),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by TEXT
        )
        """
    )
    await conn.execute(
        """
        INSERT INTO wage_runtime_settings
            (id, interval_seconds, max_payments_per_tick, updated_by)
        VALUES
            (1, $1, $2, 'wages-service-bootstrap')
        ON CONFLICT (id) DO NOTHING
        """,
        DEFAULT_WAGES_INTERVAL_SECONDS,
        DEFAULT_WAGES_MAX_PAYMENTS_PER_TICK,
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS personnel_wage_schedules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            active BOOL NOT NULL DEFAULT true,
            amount DECIMAL(20, 2) NOT NULL CHECK (amount > 0),
            currency VARCHAR(3) NOT NULL DEFAULT 'DEM',
            pay_interval_seconds INT NOT NULL CHECK (pay_interval_seconds > 0),
            next_pay_at TIMESTAMPTZ NOT NULL,
            last_paid_at TIMESTAMPTZ,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_personnel_wage_schedules_due
        ON personnel_wage_schedules (active, next_pay_at)
        """
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS personnel_wage_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            schedule_id UUID NOT NULL REFERENCES personnel_wage_schedules(id) ON DELETE CASCADE,
            account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            transaction_id UUID NOT NULL UNIQUE,
            pay_period_start TIMESTAMPTZ,
            pay_period_end TIMESTAMPTZ NOT NULL,
            amount DECIMAL(20, 2) NOT NULL CHECK (amount > 0),
            currency VARCHAR(3) NOT NULL DEFAULT 'DEM',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (schedule_id, pay_period_end)
        )
        """
    )


async def get_runtime_settings(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(
        """
        SELECT interval_seconds, max_payments_per_tick
        FROM wage_runtime_settings
        WHERE id = 1
        """
    )
    if not row:
        return {
            "interval_seconds": DEFAULT_WAGES_INTERVAL_SECONDS,
            "max_payments_per_tick": DEFAULT_WAGES_MAX_PAYMENTS_PER_TICK,
        }
    return {
        "interval_seconds": max(1, int(row["interval_seconds"])),
        "max_payments_per_tick": max(1, int(row["max_payments_per_tick"])),
    }


async def update_runtime_settings(
    conn: asyncpg.Connection,
    interval_seconds: int | None = None,
    max_payments_per_tick: int | None = None,
    updated_by: str = "api",
) -> dict:
    current = await get_runtime_settings(conn)
    new_interval = max(1, int(interval_seconds)) if interval_seconds is not None else current["interval_seconds"]
    new_max = (
        max(1, int(max_payments_per_tick))
        if max_payments_per_tick is not None
        else current["max_payments_per_tick"]
    )
    await conn.execute(
        """
        INSERT INTO wage_runtime_settings
            (id, interval_seconds, max_payments_per_tick, updated_at, updated_by)
        VALUES
            (1, $1, $2, NOW(), $3)
        ON CONFLICT (id) DO UPDATE SET
            interval_seconds = EXCLUDED.interval_seconds,
            max_payments_per_tick = EXCLUDED.max_payments_per_tick,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
        """,
        new_interval,
        new_max,
        updated_by,
    )
    return {"interval_seconds": new_interval, "max_payments_per_tick": new_max}


async def _pay_due_schedules(conn: asyncpg.Connection, max_payments: int) -> list[asyncpg.Record]:
    now = datetime.now(timezone.utc)
    schedules = await conn.fetch(
        """
        SELECT id, account_id, amount, currency, pay_interval_seconds,
               next_pay_at, last_paid_at, description
        FROM personnel_wage_schedules
        WHERE active = true
          AND next_pay_at <= $1
        ORDER BY next_pay_at, id
        LIMIT $2
        FOR UPDATE
        """,
        now,
        max_payments,
    )

    payments = []
    remaining = max_payments
    for schedule in schedules:
        schedule_id = schedule["id"]
        account_id = schedule["account_id"]
        amount = _money(schedule["amount"])
        currency = str(schedule["currency"] or "DEM").upper()
        interval = timedelta(seconds=max(1, int(schedule["pay_interval_seconds"])))
        next_pay_at = schedule["next_pay_at"]
        last_paid_at = schedule["last_paid_at"]
        description = schedule["description"] or "Scheduled personnel wage payment"

        while next_pay_at <= now and remaining > 0:
            transaction_id = uuid.uuid4()
            pay_period_start = last_paid_at
            pay_period_end = next_pay_at
            reference_id = _reference_id(schedule_id, pay_period_end)

            inserted = await conn.fetchrow(
                """
                INSERT INTO personnel_wage_payments
                    (schedule_id, account_id, transaction_id, pay_period_start,
                     pay_period_end, amount, currency)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (schedule_id, pay_period_end) DO NOTHING
                RETURNING id
                """,
                schedule_id,
                account_id,
                transaction_id,
                pay_period_start,
                pay_period_end,
                float(amount),
                currency,
            )

            if inserted:
                await conn.execute(
                    """
                    UPDATE accounts
                    SET balance = COALESCE(balance, 0) + $1,
                        updated_at = NOW()
                    WHERE id = $2
                    """,
                    float(amount),
                    account_id,
                )
                await conn.execute(
                    """
                    INSERT INTO transactions
                        (id, to_account_id, amount, currency, transaction_type,
                         description, timestamp, reference_id, metadata)
                    VALUES
                        ($1, $2, $3, $4, 'SALARY', $5, NOW(), $6, $7::jsonb)
                    """,
                    transaction_id,
                    account_id,
                    float(amount),
                    currency,
                    description,
                    reference_id,
                    json.dumps(
                        {
                            "source": "wages-service",
                            "schedule_id": str(schedule_id),
                            "pay_period_end": pay_period_end.astimezone(timezone.utc).isoformat(),
                        }
                    ),
                )
                payments.append(
                    {
                        "schedule_id": schedule_id,
                        "account_id": account_id,
                        "transaction_id": transaction_id,
                        "amount": amount,
                        "currency": currency,
                        "pay_period_end": pay_period_end,
                    }
                )
                remaining -= 1

            last_paid_at = pay_period_end
            next_pay_at = pay_period_end + interval

        await conn.execute(
            """
            UPDATE personnel_wage_schedules
            SET last_paid_at = $1,
                next_pay_at = $2,
                updated_at = NOW()
            WHERE id = $3
            """,
            last_paid_at,
            next_pay_at,
            schedule_id,
        )
        if remaining <= 0:
            break

    return payments


async def tick(pool: asyncpg.Pool, settings: dict) -> list[dict]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await _pay_due_schedules(conn, settings["max_payments_per_tick"])


async def wages_tick_loop(pool: asyncpg.Pool) -> None:
    retry_delay = DB_RETRY_BASE_SECONDS
    while True:
        try:
            tick_ts = datetime.now(timezone.utc).isoformat()
            async with pool.acquire() as conn:
                settings = await get_runtime_settings(conn)
            print(
                f"{tick_ts} wages tick started interval={settings['interval_seconds']} "
                f"max_payments_per_tick={settings['max_payments_per_tick']}"
            )
            payments = await tick(pool, settings)
            total_paid = sum((payment["amount"] for payment in payments), Decimal("0"))
            print(
                f"{datetime.now(timezone.utc).isoformat()} wages tick completed "
                f"payments={len(payments)} total_paid={total_paid}"
            )
            retry_delay = DB_RETRY_BASE_SECONDS
            await asyncio.sleep(settings["interval_seconds"])
        except asyncio.CancelledError:
            print(f"{datetime.now(timezone.utc).isoformat()} wages tick loop cancelled")
            raise
        except Exception as exc:
            if _is_transient_db_error(exc):
                print(
                    f"{datetime.now(timezone.utc).isoformat()} wages transient DB error: {exc}. "
                    f"retry_in={retry_delay}s"
                )
                await asyncio.sleep(retry_delay)
                retry_delay = min(DB_RETRY_MAX_SECONDS, retry_delay * 2)
                await pool.expire_connections()
                continue
            print(f"{datetime.now(timezone.utc).isoformat()} wages tick failed: {exc}")
            await asyncio.sleep(DEFAULT_WAGES_INTERVAL_SECONDS)


async def verify_api_key(authorization: str | None = Header(default=None)) -> None:
    if not WAGES_API_KEY:
        return
    expected = f"Bearer {WAGES_API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid wages API key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, wages_task

    if not COCKROACH_ASYNC_URL:
        raise RuntimeError("COCKROACH_ASYNC_URL is required")

    db_pool = await asyncpg.create_pool(
        COCKROACH_ASYNC_URL,
        min_size=max(1, WAGES_DB_POOL_MIN_SIZE),
        max_size=max(1, WAGES_DB_POOL_MAX_SIZE),
    )

    retry_delay = DB_RETRY_BASE_SECONDS
    while True:
        try:
            async with db_pool.acquire() as conn:
                await ensure_schema(conn)
                settings = await get_runtime_settings(conn)
            break
        except Exception as exc:
            if not _is_transient_db_error(exc):
                raise
            print(
                f"{datetime.now(timezone.utc).isoformat()} wages startup transient DB error: {exc}. "
                f"retry_in={retry_delay}s"
            )
            await asyncio.sleep(retry_delay)
            retry_delay = min(DB_RETRY_MAX_SECONDS, retry_delay * 2)
            await db_pool.expire_connections()

    print(
        f"{datetime.now(timezone.utc).isoformat()} wages service started with interval "
        f"{settings['interval_seconds']}s"
    )
    wages_task = asyncio.create_task(wages_tick_loop(db_pool), name="wages_tick_loop")

    yield

    print(f"{datetime.now(timezone.utc).isoformat()} wages service shutting down...")
    if wages_task:
        wages_task.cancel()
        try:
            await asyncio.wait_for(wages_task, timeout=5.0)
        except asyncio.TimeoutError:
            wages_task.cancel()
        except asyncio.CancelledError:
            pass
    if db_pool:
        await db_pool.close()
    print(f"{datetime.now(timezone.utc).isoformat()} wages service shutdown complete")


app = FastAPI(title="Wages Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "wages"}


@app.get("/settings")
async def settings():
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not connected")
    async with db_pool.acquire() as conn:
        return await get_runtime_settings(conn)


@app.post("/settings", dependencies=[Depends(verify_api_key)])
async def update_settings(payload: dict):
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not connected")
    async with db_pool.acquire() as conn:
        return await update_runtime_settings(
            conn,
            interval_seconds=payload.get("interval_seconds"),
            max_payments_per_tick=payload.get("max_payments_per_tick"),
            updated_by=payload.get("updated_by", "api"),
        )


@app.get("/schedules")
async def schedules(active: bool | None = None):
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not connected")
    where = "WHERE s.active = $1" if active is not None else ""
    args = [active] if active is not None else []
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT s.id, s.account_id, a.email, a.name, s.active, s.amount,
                   s.currency, s.pay_interval_seconds, s.next_pay_at,
                   s.last_paid_at, s.description
            FROM personnel_wage_schedules s
            JOIN accounts a ON a.id = s.account_id
            {where}
            ORDER BY s.next_pay_at, s.id
            """,
            *args,
        )
    return [dict(row) for row in rows]


@app.post("/trigger", dependencies=[Depends(verify_api_key)])
async def trigger():
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not connected")
    async with db_pool.acquire() as conn:
        settings = await get_runtime_settings(conn)
    payments = await tick(db_pool, settings)
    return {
        "payments": len(payments),
        "total_paid": str(sum((payment["amount"] for payment in payments), Decimal("0"))),
    }
