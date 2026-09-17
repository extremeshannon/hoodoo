from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker, DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _engine():
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
    )


engine = _engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def ensure_legacy_schema(engine) -> None:
    """Apply additive DDL for DBs created before new columns (SQLAlchemy create_all does not alter tables)."""
    if engine.dialect.name != "postgresql":
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80)"))
        conn.execute(text("ALTER TABLE carts ADD COLUMN IF NOT EXISTS fulfillment JSONB"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment JSONB"))
        conn.execute(
            text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0")
        )
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS total NUMERIC(12,2)"))
        conn.execute(text("UPDATE orders SET total = COALESCE(total, subtotal + COALESCE(shipping_amount, 0))"))
        conn.execute(text("ALTER TABLE orders ALTER COLUMN total SET DEFAULT 0"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
