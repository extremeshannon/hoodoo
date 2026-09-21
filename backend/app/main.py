from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.bootstrap import bootstrap_staff_if_configured
from app.config import get_settings
from app.database import Base, SessionLocal, engine, ensure_legacy_schema
from app.routers import (
    admin,
    admin_config,
    auth,
    cart,
    catalog,
    dyesub,
    garment_3d,
    orders,
    production,
    shipping,
    shop_quote,
)
from app.site_guide import router as site_guide_router
from app.seed import seed_if_empty
from app.staff_pages import is_customer_auth_path, is_staff_only_path, login_redirect_url


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
        ensure_legacy_schema(engine)
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

_settings = get_settings()


def _deny_shop_page(path: str, query: str, detail: str):
    if path.startswith("/3d/") or path.startswith("/data/") or path.startswith("/js/"):
        return JSONResponse({"detail": detail}, status_code=401)
    return RedirectResponse(login_redirect_url(path, query), status_code=302)


@app.middleware("http")
async def staff_only_shop_pages(request, call_next):
    path = request.url.path
    session = request.scope.get("session") or {}
    role = session.get("role")
    if is_staff_only_path(path) and role not in ("staff", "admin"):
        return _deny_shop_page(path, request.url.query, "Staff access required")
    if is_customer_auth_path(path) and not session.get("uid"):
        return _deny_shop_page(path, request.url.query, "Sign in required")
    return await call_next(request)


@app.middleware("http")
async def no_cache_configurator(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if (
        path in ("/suit", "/suit.html", "/suit.css", "/dyesub", "/dyesub.html", "/dyesub.css")
        or path.startswith("/js/suit-configurator.js")
        or path.startswith("/js/sizing-avatar.js")
        or path.startswith("/js/dyesub")
        or path.startswith("/js/config-preview.js")
        or path.startswith("/3d/sizing/")
        or path.startswith("/3d/clo/manifest.json")
        or path.startswith("/data/materials.json")
        or path.startswith("/admin/")
        or path.startswith("/js/admin-configurator.js")
        or path in ("/configurator.html", "/configurator.js", "/configurator.css", "/cart.html", "/cart.js")
    ):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

app.include_router(catalog.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(garment_3d.router, prefix="/api")
app.include_router(shop_quote.router, prefix="/api")
app.include_router(shipping.router, prefix="/api")
app.include_router(production.router, prefix="/api")
app.include_router(dyesub.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(admin_config.router)
app.include_router(site_guide_router, prefix="/api")


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
        return FileResponse(path, headers={"Cache-Control": "no-cache"})

    @app.get("/login")
    def serve_login():
        return _html("login.html")

    @app.get("/register")
    def serve_register():
        return _html("register.html")

    @app.get("/forgot-password")
    def serve_forgot_password():
        return _html("forgot-password.html")

    @app.get("/reset-password")
    def serve_reset_password():
        return _html("reset-password.html")

    @app.get("/quote")
    def serve_quote():
        return _html("quote.html")

    @app.get("/pricing")
    def serve_pricing():
        return _html("pricing.html")

    @app.get("/suit")
    def serve_suit():
        return _html("suit.html")

    @app.get("/suit.html")
    def serve_suit_html():
        return _html("suit.html")

    @app.get("/dyesub")
    def serve_dyesub():
        return _html("dyesub.html")

    @app.get("/dyesub.html")
    def serve_dyesub_html():
        return _html("dyesub.html")

    # Explicit home page so we never use StaticFiles(html=True), which serves index.html
    # for *any* missing path (e.g. /api/health) if that mount handles the request first.
    @app.get("/")
    def serve_index():
        return FileResponse(root / "index.html")

    app.mount("/", StaticFiles(directory=str(root), html=False), name="site")


_attach_static()

# Last-added middleware runs first, so Session wraps staff_only and can populate scope["session"].
app.add_middleware(
    SessionMiddleware,
    secret_key=_settings.jwt_secret,
    session_cookie="hoodoo_admin_session",
    same_site="lax",
    https_only=False,
    max_age=60 * 60 * 24 * 7,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
