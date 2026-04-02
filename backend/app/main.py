from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.routers import cart, catalog
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        root = resolve_repo_root(settings)
        catalog_path = Path(settings.catalog_seed_path)
        if not catalog_path.is_absolute():
            catalog_path = root / catalog_path
        seed_if_empty(db, catalog_path)
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


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _attach_static():
    settings = get_settings()
    root = resolve_repo_root(settings)
    if root.is_dir() and (root / "index.html").is_file():
        app.mount("/", StaticFiles(directory=str(root), html=True), name="site")


_attach_static()
