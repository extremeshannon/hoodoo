from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.decoration import estimate, load_pricing
from app.deps import require_staff

router = APIRouter(tags=["quote"], dependencies=[Depends(require_staff)])


class QuoteIn(BaseModel):
    garment: str = "tee"
    quantity: int = Field(12, ge=1, le=999)
    method: str = "embroidery"
    stitches: int = Field(5000, ge=1000, le=40000)
    colors: int = Field(1, ge=1, le=8)
    locations: int = Field(1, ge=1, le=6)
    hasDst: bool = False
    textOnly: bool = False
    names: int = Field(0, ge=0, le=999)


@router.get("/pricing/decoration")
def decoration_tables():
    return load_pricing()


@router.post("/quote/estimate")
def quote_estimate(body: QuoteIn):
    try:
        return estimate(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
