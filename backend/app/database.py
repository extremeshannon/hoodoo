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
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS dyesub_jobs (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    garment_id VARCHAR(80) NOT NULL,
                    name VARCHAR(255) NOT NULL DEFAULT 'Untitled print',
                    status VARCHAR(40) NOT NULL DEFAULT 'draft',
                    layout JSONB NOT NULL DEFAULT '{}'::jsonb,
                    notes TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dyesub_jobs_user_id ON dyesub_jobs (user_id)"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS dyesub_art (
                    id UUID PRIMARY KEY,
                    job_id UUID NOT NULL REFERENCES dyesub_jobs(id) ON DELETE CASCADE,
                    filename VARCHAR(255) NOT NULL,
                    mime VARCHAR(80) NOT NULL DEFAULT 'image/png',
                    byte_size INTEGER NOT NULL DEFAULT 0,
                    data BYTEA NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dyesub_art_job_id ON dyesub_art (job_id)"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
