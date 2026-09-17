from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import require_staff
from app.production_pack import build_pack_zip

router = APIRouter(tags=["production"], dependencies=[Depends(require_staff)])


class ProductionJob(BaseModel):
    jobId: str | None = None
    pattern: str = "freefly"
    product: str = ""
    productName: str = ""
    fit: str = ""
    parts: dict[str, Any] = Field(default_factory=dict)
    partDetails: dict[str, Any] = Field(default_factory=dict)
    embroideryText: str = ""
    art: dict[str, str] = Field(default_factory=dict)
    sizing: dict = Field(default_factory=dict)
    notes: str = ""
    customer: dict = Field(default_factory=dict)


@router.post("/production/pack")
def production_pack(body: ProductionJob):
    raw = build_pack_zip(body.model_dump())
    name = (body.jobId or "hoodoo-job") + "-print-cut.zip"
    return Response(
        content=raw,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
