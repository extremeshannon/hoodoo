from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.bootstrap import bootstrap_staff_if_configured
from app.config import get_settings
from app.database import Base, SessionLocal, engine, ensure_legacy_schema
from app.routers import admin, auth, cart, catalog, garment_3d, orders
from app.seed import seed_if_empty


def resolve_repo_root(settings) -> Path:
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    pkg = Path(__file__).resolve().parent  # .../backend/app
    repo_from_backend = pkg.parent.parent  # .../HooDoo (dev)
    if (repo_from_backend / "data" / "catalog.json").is_file():
        return repo_from_backend
    flat = pkg.parent  # e.g. /app when package is /app/app
    if (flat / "data" / "catalog.json").is_file():
        return flat
    return repo_from_backend


def run_db_migrations() -> None:
    """Apply Alembic migrations when alembic.ini is present (Docker / backend checkout).

    If the database already has tables from an older deploy without ``alembic_version``,
    stamp once: ``alembic stamp 72bb3bf2d7cb`` (then use ``upgrade`` normally).

    When ``alembic.ini`` is missing, fall back to SQLAlchemy ``create_all`` plus legacy DDL.
    """
    ini = Path(__file__).resolve().parent.parent / "alembic.ini"
    if ini.is_file():
        command.upgrade(Config(str(ini)), "head")
        return
    Base.metadata.create_all(bind=engine)
    ensure_legacy_schema(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    run_db_migrations()
    db = SessionLocal()
    try:
        root = resolve_repo_root(settings)
        catalog_path = Path(settings.catalog_seed_path)
        if not catalog_path.is_absolute():
            catalog_path = root / catalog_path
        seed_if_empty(db, catalog_path)
        bootstrap_staff_if_configured(db, settings)
    finally:
        db.close()
    yield


app = FastAPI(title="Hoodoo Alaska API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(garment_3d.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _attach_static():
    settings = get_settings()
    root = resolve_repo_root(settings)
    if not root.is_dir() or not (root / "index.html").is_file():
        return
    three_d = root / "3d"
    if three_d.is_dir():
        app.mount("/3d", StaticFiles(directory=str(three_d)), name="garment_3d_files")

    # Auth pages: explicit routes so /login (no .html) always serves the current file (avoids stale SPA-style caches).
    def _html(name: str) -> FileResponse:
        path = root / name
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(path)

    @app.get("/login")
    def serve_login():
        return _html("login.html")

    @app.get("/register")
    def serve_register():
        return _html("register.html")

    @app.get("/forgot-password")
    def serve_forgot_password():
        return _html("forgot-password.html")

    # Explicit home page so we never use StaticFiles(html=True), which serves index.html
    # for *any* missing path (e.g. /api/health) if that mount handles the request first.
    @app.get("/")
    def serve_index():
        return FileResponse(root / "index.html")

    app.mount("/", StaticFiles(directory=str(root), html=False), name="site")


_attach_static()
