"""Admin 3D configurator: session login + garment/GLB/materials editors."""

from __future__ import annotations

import secrets
import time
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.configurator_store import (
    FIT_IDS,
    MAX_GLB_BYTES,
    StoreError,
    add_garment,
    add_group,
    clo_dir,
    delete_group,
    rename_group,
    save_maps,
    save_materials,
    set_glb,
    snapshot,
    update_garment,
)
from app.database import get_db
from app.models import User
from app.security import verify_password

router = APIRouter(tags=["admin-config"])
TPL = Path(__file__).resolve().parent.parent / "templates" / "admin"


def _root() -> Path:
    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    pkg = Path(__file__).resolve().parent.parent
    repo = pkg.parent.parent
    if (repo / "data" / "catalog.json").is_file():
        return repo
    flat = pkg.parent
    if (flat / "data" / "catalog.json").is_file():
        return flat
    return repo


def _ensure_csrf(request: Request) -> str:
    token = request.session.get("csrf")
    if not token:
        token = secrets.token_urlsafe(24)
        request.session["csrf"] = token
    return token


def _same_origin(request: Request) -> bool:
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if not origin:
        return True
    host = request.headers.get("host") or ""
    return urlparse(origin).netloc == host


def staff_from_session(request: Request, db: Session) -> User | None:
    uid = request.session.get("uid")
    if not uid:
        return None
    try:
        user = db.get(User, UUID(str(uid)))
    except (ValueError, TypeError):
        return None
    if not user or not user.is_active or user.role not in ("staff", "admin"):
        return None
    return user


def require_staff_session(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = staff_from_session(request, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not _same_origin(request):
            raise HTTPException(status_code=403, detail="Bad origin")
        sent = request.headers.get("x-csrf-token") or request.query_params.get("csrf") or ""
        if sent != request.session.get("csrf"):
            raise HTTPException(status_code=403, detail="Bad CSRF token")
    return user


def _page(name: str, **repl) -> HTMLResponse:
    path = TPL / name
    html = path.read_text(encoding="utf-8")
    for k, v in repl.items():
        html = html.replace("{{" + k + "}}", str(v))
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


@router.get("/admin/login", response_class=HTMLResponse)
def login_get(request: Request, db: Session = Depends(get_db), next: str = "/admin/configurator"):
    if staff_from_session(request, db):
        return RedirectResponse(next or "/admin/configurator", status_code=302)
    err = (request.query_params.get("error") or "").replace("<", "").replace(">", "")[:200]
    return _page("login.html", csrf=_ensure_csrf(request), error=err, next=next or "/admin/configurator")


@router.post("/admin/login")
def login_post(
    request: Request,
    db: Session = Depends(get_db),
    username: str = Form(""),
    password: str = Form(""),
    csrf: str = Form(""),
    next: str = Form("/admin/configurator"),
):
    if csrf != request.session.get("csrf"):
        return RedirectResponse("/admin/login?error=Session+expired.+Try+again.", status_code=302)
    login_id = (username or "").strip().lower()
    user = db.scalar(select(User).where(or_(User.email == login_id, User.username == login_id)))
    nxt = next if str(next).startswith("/admin") else "/admin/configurator"
    if not user or not verify_password(password, user.hashed_password) or not user.is_active:
        return RedirectResponse("/admin/login?error=Incorrect+username+or+password", status_code=302)
    if user.role not in ("staff", "admin"):
        return RedirectResponse("/admin/login?error=Staff+access+required", status_code=302)
    request.session["uid"] = str(user.id)
    request.session["role"] = user.role
    _ensure_csrf(request)
    return RedirectResponse(nxt, status_code=302)


@router.get("/admin/logout")
@router.post("/admin/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/admin/login", status_code=302)


@router.get("/admin/configurator", response_class=HTMLResponse)
def configurator_page(request: Request, db: Session = Depends(get_db)):
    if not staff_from_session(request, db):
        return RedirectResponse("/admin/login?next=/admin/configurator", status_code=302)
    user = staff_from_session(request, db)
    return _page(
        "configurator.html",
        csrf=_ensure_csrf(request),
        user=(user.username or user.email) if user else "staff",
    )


@router.get("/admin/config/state")
def config_state(_: User = Depends(require_staff_session)):
    try:
        return snapshot(_root())
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/config/garments")
def config_add_garment(body: dict, _: User = Depends(require_staff_session)):
    try:
        return add_garment(_root(), body)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/admin/config/garments/{product_id}")
def config_patch_garment(product_id: str, body: dict, _: User = Depends(require_staff_session)):
    try:
        return update_garment(_root(), product_id, body)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/config/groups")
def config_add_group(body: dict, _: User = Depends(require_staff_session)):
    try:
        return add_group(_root(), body)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/admin/config/groups/{group_id}")
def config_rename_group(group_id: str, body: dict, _: User = Depends(require_staff_session)):
    try:
        return rename_group(_root(), group_id, body)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/admin/config/groups/{group_id}")
def config_delete_group(group_id: str, _: User = Depends(require_staff_session)):
    try:
        return delete_group(_root(), group_id)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/admin/config/materials")
def config_materials(body: dict, _: User = Depends(require_staff_session)):
    try:
        return save_materials(_root(), body)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/admin/config/maps")
def config_maps(body: dict, _: User = Depends(require_staff_session)):
    try:
        return save_maps(_root(), mesh_map=body.get("meshMap"), mesh_notes=body.get("meshNotes"))
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/config/garments/{product_id}/glb")
async def config_upload_glb(
    product_id: str,
    _: User = Depends(require_staff_session),
    fit: str = Form("unisex"),
    file: UploadFile = File(...),
):
    fit = (fit or "unisex").strip().lower()
    if fit not in FIT_IDS:
        raise HTTPException(status_code=400, detail="Unknown fit")
    name = (file.filename or "").lower()
    if not name.endswith(".glb"):
        raise HTTPException(status_code=400, detail="Upload a .glb file only")
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in Path(file.filename or "garment.glb").name)
    if not safe.lower().endswith(".glb"):
        safe += ".glb"
    dest_dir = clo_dir(_root()) / product_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / safe
    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_GLB_BYTES:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="Max GLB size is 50MB")
                out.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Could not save file") from exc
    url = f"/3d/clo/{product_id}/{safe}?v={int(time.time())}"
    try:
        product = set_glb(_root(), product_id, fit, url)
    except StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse({"ok": True, "url": url, "bytes": size, "product": product})
