"""Dye-sub configurator API: garments, saved jobs, art upload, print pack."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.dyesub_catalog import list_garments_public, load_garment, resolve_garment_id
from app.dyesub_pack import build_dyesub_zip
from app.models import DyeSubArt, DyeSubJob, User

router = APIRouter(prefix="/dyesub", tags=["dyesub"])

MAX_ART_BYTES = 16 * 1024 * 1024
MAX_ART_PER_JOB = 24
ALLOWED_ART_MIME = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}


class DyeSubJobCreate(BaseModel):
    garment_id: str | None = None
    product: str | None = None
    fit: str | None = None
    name: str = Field("Untitled print", max_length=255)
    layout: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None


class DyeSubJobUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    layout: dict[str, Any] | None = None
    notes: str | None = None
    status: str | None = Field(None, max_length=40)


class DyeSubArtOut(BaseModel):
    id: UUID
    filename: str
    mime: str
    byte_size: int
    created_at: datetime


class DyeSubJobOut(BaseModel):
    id: UUID
    garment_id: str
    name: str
    status: str
    layout: dict[str, Any]
    notes: str | None
    created_at: datetime
    updated_at: datetime
    owner_email: str | None = None
    artworks: list[DyeSubArtOut] = Field(default_factory=list)


def _repo_root() -> Path:
    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    return Path(__file__).resolve().parent.parent.parent.parent


def _job_out(job: DyeSubJob, *, include_owner: bool = False) -> DyeSubJobOut:
    arts = [
        DyeSubArtOut(
            id=a.id,
            filename=a.filename,
            mime=a.mime,
            byte_size=a.byte_size,
            created_at=a.created_at,
        )
        for a in (job.artworks or [])
    ]
    return DyeSubJobOut(
        id=job.id,
        garment_id=job.garment_id,
        name=job.name,
        status=job.status,
        layout=job.layout or {},
        notes=job.notes,
        created_at=job.created_at,
        updated_at=job.updated_at,
        owner_email=job.user.email if include_owner and job.user else None,
        artworks=arts,
    )


def _get_job(db: Session, job_id: UUID, user: User) -> DyeSubJob:
    job = db.scalar(
        select(DyeSubJob)
        .where(DyeSubJob.id == job_id)
        .options(selectinload(DyeSubJob.artworks), selectinload(DyeSubJob.user))
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.user_id != user.id and user.role not in ("staff", "admin"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.get("/garments")
def garments():
    return {"garments": list_garments_public(_repo_root())}


@router.get("/garments/{garment_id}")
def garment_detail(garment_id: str, product: str | None = None, fit: str | None = None):
    root = _repo_root()
    gid = resolve_garment_id(root, garment_id, product, fit) or garment_id
    return load_garment(root, gid)


@router.get("/jobs", response_model=list[DyeSubJobOut])
def list_jobs(
    all_users: bool = Query(False, alias="all"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = select(DyeSubJob).options(selectinload(DyeSubJob.artworks), selectinload(DyeSubJob.user)).order_by(
        DyeSubJob.updated_at.desc()
    )
    include_owner = False
    if all_users:
        if user.role not in ("staff", "admin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
        include_owner = True
    else:
        q = q.where(DyeSubJob.user_id == user.id)
    jobs = db.scalars(q).unique().all()
    return [_job_out(j, include_owner=include_owner) for j in jobs]


@router.post("/jobs", response_model=DyeSubJobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    body: DyeSubJobCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    root = _repo_root()
    gid = resolve_garment_id(root, body.garment_id, body.product, body.fit)
    if not gid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown garment")
    load_garment(root, gid)
    job = DyeSubJob(
        user_id=user.id,
        garment_id=gid,
        name=(body.name or "Untitled print").strip() or "Untitled print",
        layout=body.layout or {},
        notes=body.notes,
        status="draft",
    )
    db.add(job)
    db.commit()
    job = _get_job(db, job.id, user)
    return _job_out(job)


@router.get("/jobs/{job_id}", response_model=DyeSubJobOut)
def get_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _job_out(_get_job(db, job_id, user), include_owner=user.role in ("staff", "admin"))


@router.put("/jobs/{job_id}", response_model=DyeSubJobOut)
def update_job(
    job_id: UUID,
    body: DyeSubJobUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    if body.name is not None:
        job.name = body.name.strip() or job.name
    if body.layout is not None:
        job.layout = body.layout
    if body.notes is not None:
        job.notes = body.notes
    if body.status is not None:
        job.status = body.status
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


@router.post("/jobs/{job_id}/art", response_model=DyeSubArtOut, status_code=status.HTTP_201_CREATED)
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
    if mime == "image/jpg":
        mime = "image/jpeg"
    name = file.filename or "art.png"
    lower = name.lower()
    if mime not in ALLOWED_ART_MIME:
        if lower.endswith(".png"):
            mime = "image/png"
        elif lower.endswith(".jpg") or lower.endswith(".jpeg"):
            mime = "image/jpeg"
        elif lower.endswith(".webp"):
            mime = "image/webp"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload PNG, JPEG, or WebP")
    blob = await file.read()
    if not blob:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(blob) > MAX_ART_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Artwork is over 16 MB")
    art = DyeSubArt(
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
    return DyeSubArtOut(
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
    job.layout = layout
    db.delete(art)
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    return None


@router.get("/jobs/{job_id}/pack")
def download_pack(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id, user)
    root = _repo_root()
    garment = load_garment(root, job.garment_id)
    arts = {str(a.id): (a.filename, a.mime, bytes(a.data)) for a in job.artworks}
    raw = build_dyesub_zip(
        garment=garment,
        job_meta={
            "id": str(job.id),
            "name": job.name,
            "notes": job.notes,
            "customer": {"email": job.user.email if job.user else "", "name": job.user.full_name if job.user else ""},
        },
        layout=job.layout or {},
        arts=arts,
        repo_root=root,
    )
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in (job.name or "print"))[:40] or "print"
    filename = f"hoodoo-{safe}-{str(job.id)[:8]}.zip"
    return Response(
        content=raw,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
