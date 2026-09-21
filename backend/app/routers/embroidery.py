"""Embroidery configurator API: hats/caps/beanies, art, stitch estimate, quote."""

from __future__ import annotations

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.database import get_db
from app.decoration import estimate
from app.deps import get_current_user, require_staff
from app.models import EmbroideryArt, EmbroideryJob, Order, OrderLine, User
from app.embroidery_catalog import get_garment, list_garments

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/embroidery", tags=["embroidery"], dependencies=[Depends(get_current_user)])

MAX_ART_BYTES = 16 * 1024 * 1024
MAX_ART_PER_JOB = 24
ALLOWED_ART_MIME = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/webp",
    "image/x-png",
}


def _sniff_art_mime(name: str, mime: str, blob: bytes) -> str | None:
    raw = blob[:16]
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "image/webp"
    lower = (name or "").lower()
    mime = (mime or "").split(";")[0].strip().lower()
    if mime == "image/jpg" or mime == "image/pjpeg":
        mime = "image/jpeg"
    if mime == "image/x-png":
        mime = "image/png"
    if mime in ALLOWED_ART_MIME:
        return "image/jpeg" if mime == "image/jpg" else mime
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".webp"):
        return "image/webp"
    return None


class EmbroideryJobCreate(BaseModel):
    garment_id: str
    name: str = Field("Untitled embroidery", max_length=255)
    layout: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None


class EmbroideryJobUpdate(BaseModel):
    garment_id: str | None = Field(None, max_length=80)
    name: str | None = Field(None, max_length=255)
    layout: dict[str, Any] | None = None
    notes: str | None = None
    status: str | None = Field(None, max_length=40)


class EmbroideryEstimateIn(BaseModel):
    garment_id: str
    quantity: int = 1
    stitches: int = 5000
    locations: int = 1
    has_dst: bool = False
    garment_name: str | None = None
    blank_price: float | None = None


class EmbroideryArtOut(BaseModel):
    id: UUID
    filename: str
    mime: str
    byte_size: int
    created_at: datetime


class EmbroideryJobOut(BaseModel):
    id: UUID
    garment_id: str
    name: str
    status: str
    layout: dict[str, Any]
    notes: str | None
    created_at: datetime
    updated_at: datetime
    owner_id: UUID | None = None
    owner_email: str | None = None
    owner_name: str | None = None
    artworks: list[EmbroideryArtOut] = Field(default_factory=list)
    quote: dict[str, Any] | None = None
    order_id: UUID | None = None


def _repo_root() -> Path:
    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    return Path(__file__).resolve().parent.parent.parent.parent


def _job_out(job: EmbroideryJob, *, include_owner: bool = False) -> EmbroideryJobOut:
    arts = [
        EmbroideryArtOut(
            id=a.id,
            filename=a.filename,
            mime=a.mime,
            byte_size=a.byte_size,
            created_at=a.created_at,
        )
        for a in (job.artworks or [])
    ]
    layout = job.layout or {}
    quote = layout.get("quote") if isinstance(layout, dict) else None
    order_id = None
    if isinstance(layout, dict) and layout.get("orderId"):
        try:
            order_id = UUID(str(layout["orderId"]))
        except (ValueError, TypeError):
            order_id = None
    return EmbroideryJobOut(
        id=job.id,
        garment_id=job.garment_id,
        name=job.name,
        status=job.status,
        layout=layout,
        notes=job.notes,
        created_at=job.created_at,
        updated_at=job.updated_at,
        owner_id=job.user_id if include_owner else None,
        owner_email=job.user.email if include_owner and job.user else None,
        owner_name=(job.user.full_name if include_owner and job.user else None),
        artworks=arts,
        quote=quote if isinstance(quote, dict) else None,
        order_id=order_id,
    )


def _get_job(db: Session, job_id: UUID, user: User) -> EmbroideryJob:
    job = db.scalar(
        select(EmbroideryJob)
        .where(EmbroideryJob.id == job_id)
        .options(selectinload(EmbroideryJob.artworks), selectinload(EmbroideryJob.user))
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.user_id != user.id and user.role not in ("staff", "admin"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _layout_counts(layout: dict[str, Any]) -> tuple[int, int]:
    placements = list(layout.get("placements") or [])
    loc_ids = {str(p.get("location") or "") for p in placements if p.get("location")}
    locations = max(1, len(loc_ids)) if placements else 1
    dropped = set()
    for art in (layout.get("art") or {}).values() if isinstance(layout.get("art"), dict) else []:
        for hex_c in art.get("dropped") or []:
            dropped.add(str(hex_c).lower())
    kept = []
    for art in (layout.get("art") or {}).values() if isinstance(layout.get("art"), dict) else []:
        for c in art.get("colors") or []:
            hx = str(c.get("hex") or "").lower()
            if hx and hx not in dropped:
                kept.append(hx)
    colors = max(1, len(set(kept))) if kept else max(1, int(layout.get("colors") or 1))
    return colors, locations


def _stitches_from_layout(layout: dict[str, Any]) -> int:
    n = int(layout.get("stitches") or 0)
    if n <= 0:
        n = sum(max(0, int(p.get("stitches") or 0)) for p in (layout.get("placements") or []))
    return max(5000, n or 5000)


def _qty_from_layout(layout: dict[str, Any]) -> int:
    qty = max(1, min(999, int(layout.get("quantity") or 1)))
    sizes = layout.get("sizes") if isinstance(layout.get("sizes"), dict) else {}
    size_sum = sum(max(0, int(v or 0)) for v in sizes.values())
    if size_sum > 0:
        qty = min(999, size_sum)
    return qty


def _estimate_payload(garment: dict[str, Any], layout: dict[str, Any], *, stitches: int | None = None, locations: int | None = None, quantity: int | None = None, has_dst: bool | None = None, garment_name: str | None = None, blank_price: float | None = None) -> dict[str, Any]:
    colors, loc_n = _layout_counts(layout)
    qty = quantity if quantity is not None else _qty_from_layout(layout)
    st = stitches if stitches is not None else _stitches_from_layout(layout)
    locs = locations if locations is not None else loc_n
    dst = bool(layout.get("hasDst") if has_dst is None else has_dst)
    color_row = None
    cid = str(layout.get("colorId") or "")
    for c in garment.get("colors") or []:
        if str(c.get("id")) == cid:
            color_row = c
            break
    if color_row is None and garment.get("colors"):
        color_row = garment["colors"][0]
    label = garment_name or f"{garment.get('vendor')} {garment.get('model')} {garment.get('name')}"
    if color_row and " · " not in label:
        label = f"{label} · {color_row.get('name')}"
    return {
        "method": "embroidery",
        "garment": "hat",
        "garmentName": label,
        "blankPrice": float(blank_price if blank_price is not None else garment.get("price") or 14),
        "quantity": qty,
        "stitches": st,
        "locations": locs,
        "hasDst": dst,
        "colors": colors,
    }


def _estimate_for_job(root: Path, job: EmbroideryJob) -> dict[str, Any]:
    garment = get_garment(root, job.garment_id)
    if not garment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown garment")
    return estimate(_estimate_payload(garment, job.layout or {}))


@router.get("/garments")
def garments():
    return list_garments(_repo_root())


@router.get("/garments/{garment_id}")
def garment_detail(garment_id: str):
    g = get_garment(_repo_root(), garment_id)
    if not g:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown garment")
    data = list_garments(_repo_root())
    return {
        "garment": g,
        "locations": [loc for loc in data["locations"] if loc["id"] in (g.get("locationIds") or [])],
        "meta": data.get("meta") or {},
    }


@router.post("/estimate")
def quote_estimate(body: EmbroideryEstimateIn):
    root = _repo_root()
    g = get_garment(root, body.garment_id)
    if not g:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown garment")
    label = body.garment_name or f"{g.get('vendor')} {g.get('model')} {g.get('name')}"
    blank = body.blank_price if body.blank_price is not None else float(g.get("price") or 14)
    return estimate(
        {
            "method": "embroidery",
            "garment": "hat",
            "garmentName": label,
            "blankPrice": blank,
            "quantity": body.quantity,
            "stitches": body.stitches,
            "locations": body.locations,
            "hasDst": body.has_dst,
        }
    )


@router.get("/jobs", response_model=list[EmbroideryJobOut])
def list_jobs(
    all_users: bool = Query(False, alias="all"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        select(EmbroideryJob)
        .options(selectinload(EmbroideryJob.artworks), selectinload(EmbroideryJob.user))
        .order_by(EmbroideryJob.updated_at.desc())
    )
    include_owner = False
    if all_users:
        if user.role not in ("staff", "admin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
        include_owner = True
    else:
        q = q.where(EmbroideryJob.user_id == user.id)
    jobs = db.scalars(q).unique().all()
    return [_job_out(j, include_owner=include_owner) for j in jobs]


@router.post("/jobs", response_model=EmbroideryJobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    body: EmbroideryJobCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    root = _repo_root()
    if not get_garment(root, body.garment_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown garment")
    job = EmbroideryJob(
        user_id=user.id,
        garment_id=body.garment_id,
        name=(body.name or "Untitled embroidery").strip() or "Untitled embroidery",
        layout=body.layout or {},
        notes=body.notes,
        status="draft",
    )
    db.add(job)
    db.commit()
    job = _get_job(db, job.id, user)
    return _job_out(job)


@router.get("/jobs/{job_id}", response_model=EmbroideryJobOut)
def get_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _job_out(_get_job(db, job_id, user), include_owner=user.role in ("staff", "admin"))


@router.put("/jobs/{job_id}", response_model=EmbroideryJobOut)
def update_job(
    job_id: UUID,
    body: EmbroideryJobUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    if body.name is not None:
        job.name = body.name.strip() or job.name
    if body.garment_id is not None:
        if not get_garment(_repo_root(), body.garment_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown garment")
        job.garment_id = body.garment_id
    if body.layout is not None:
        job.layout = body.layout
        flag_modified(job, "layout")
    if body.notes is not None:
        job.notes = body.notes
    if body.status is not None:
        if user.role in ("staff", "admin"):
            job.status = body.status
        elif body.status in ("draft", "quote_requested") and job.user_id == user.id:
            job.status = body.status
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot change job status")
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _job_out(_get_job(db, job_id, user), include_owner=user.role in ("staff", "admin"))


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    db.delete(job)
    db.commit()
    return None


@router.post("/jobs/{job_id}/art", response_model=EmbroideryArtOut, status_code=status.HTTP_201_CREATED)
async def upload_art(
    job_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    if len(job.artworks or []) >= MAX_ART_PER_JOB:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many artworks on this job")
    mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    name = file.filename or "art.png"
    blob = await file.read()
    if not blob:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(blob) > MAX_ART_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Artwork is over 16 MB")
    mime = _sniff_art_mime(name, mime, blob)
    if not mime:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload PNG, JPEG, or WebP")
    art = EmbroideryArt(
        job_id=job.id,
        filename=name[:255],
        mime=mime,
        byte_size=len(blob),
        data=blob,
    )
    db.add(art)
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(art)
    return EmbroideryArtOut(
        id=art.id,
        filename=art.filename,
        mime=art.mime,
        byte_size=art.byte_size,
        created_at=art.created_at,
    )


@router.get("/jobs/{job_id}/art/{art_id}")
def get_art(
    job_id: UUID,
    art_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    art = next((a for a in job.artworks if a.id == art_id), None)
    if not art:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
    return Response(content=bytes(art.data), media_type=art.mime or "image/png")


@router.delete("/jobs/{job_id}/art/{art_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_art(
    job_id: UUID,
    art_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    art = next((a for a in job.artworks if a.id == art_id), None)
    if not art:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
    layout = dict(job.layout or {})
    placements = [p for p in (layout.get("placements") or []) if str(p.get("artId")) != str(art_id)]
    layout["placements"] = placements
    art_meta = dict(layout.get("art") or {})
    art_meta.pop(str(art_id), None)
    layout["art"] = art_meta
    job.layout = layout
    flag_modified(job, "layout")
    db.delete(art)
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    return None


@router.post("/jobs/{job_id}/quote", response_model=EmbroideryJobOut)
def request_quote(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    if not job.artworks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload artwork before sending a quote")
    layout = dict(job.layout or {})
    if not (layout.get("placements") or []):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Place at least one logo before sending a quote")
    est = _estimate_for_job(_repo_root(), job)
    layout["quote"] = est
    order = None
    existing = layout.get("orderId")
    if existing:
        try:
            oid = UUID(str(existing))
        except (ValueError, TypeError):
            oid = None
        if oid:
            order = db.scalar(select(Order).where(Order.id == oid).options(selectinload(Order.lines)))
            if order and order.user_id != user.id:
                order = None
    qty = int(est.get("quantity") or layout.get("quantity") or 1)
    subtotal = Decimal(str(est.get("subtotal") or "0"))
    each = Decimal(str(est.get("each") or "0"))
    if order is None:
        order = Order(
            user_id=user.id,
            status="submitted",
            subtotal=subtotal,
            customer_note=job.notes,
        )
        db.add(order)
        db.flush()
        db.add(
            OrderLine(
                order_id=order.id,
                product_id=None,
                product_slug_snapshot="embroidery",
                product_name_snapshot=job.name,
                quantity=qty,
                configuration={
                    "kind": "embroidery",
                    "jobId": str(job.id),
                    "garmentId": job.garment_id,
                    "layout": {
                        "colorId": layout.get("colorId"),
                        "quantity": qty,
                        "sizes": layout.get("sizes") or {},
                        "placements": layout.get("placements") or [],
                        "art": layout.get("art") or {},
                    },
                    "quote": est,
                },
                unit_price=each,
                line_total=subtotal,
                label_snapshot=f"Embroidery · {job.name} · {qty} pc",
            )
        )
        layout["orderId"] = str(order.id)
    else:
        order.subtotal = subtotal
        order.status = "submitted"
        order.customer_note = job.notes
        if order.lines:
            line = order.lines[0]
            line.quantity = qty
            line.unit_price = each
            line.line_total = subtotal
            line.label_snapshot = f"Embroidery · {job.name} · {qty} pc"
            line.configuration = {
                "kind": "embroidery",
                "jobId": str(job.id),
                "garmentId": job.garment_id,
                "layout": {
                    "colorId": layout.get("colorId"),
                    "quantity": qty,
                    "sizes": layout.get("sizes") or {},
                    "placements": layout.get("placements") or [],
                    "art": layout.get("art") or {},
                },
                "quote": est,
            }
    job.layout = layout
    flag_modified(job, "layout")
    job.status = "quote_requested"
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _job_out(_get_job(db, job.id, user), include_owner=user.role in ("staff", "admin"))


@router.get("/jobs/{job_id}/pack")
def download_pack(
    job_id: UUID,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    root = _repo_root()
    garment = get_garment(root, job.garment_id) or {"id": job.garment_id}
    layout = job.layout or {}
    est = layout.get("quote") if isinstance(layout.get("quote"), dict) else _estimate_for_job(root, job)
    spec = {
        "id": str(job.id),
        "name": job.name,
        "status": job.status,
        "notes": job.notes,
        "garment": garment,
        "layout": layout,
        "quote": est,
        "customer": {
            "email": job.user.email if job.user else "",
            "name": job.user.full_name if job.user else "",
        },
        "placements": layout.get("placements") or [],
        "art": [
            {
                "id": str(a.id),
                "filename": a.filename,
                "mime": a.mime,
                "byte_size": a.byte_size,
            }
            for a in (job.artworks or [])
        ],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("spec.json", json.dumps(spec, indent=2, default=str))
        used = set()
        for a in job.artworks or []:
            name = a.filename or f"{a.id}.png"
            safe = "".join(c if c.isalnum() or c in ".-_" else "-" for c in name) or "art.png"
            if safe in used:
                safe = f"{a.id.hex[:8]}-{safe}"
            used.add(safe)
            zf.writestr(f"art/{safe}", bytes(a.data))
    raw = buf.getvalue()
    safe_job = "".join(c if c.isalnum() or c in "-_" else "-" for c in (job.name or "print"))[:40] or "print"
    filename = f"hoodoo-embroidery-{safe_job}-{str(job.id)[:8]}.zip"
    return Response(
        content=raw,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
