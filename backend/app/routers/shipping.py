from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import require_staff
from app.shipping import methods_public, quote

router = APIRouter(prefix="/shipping", tags=["shipping"], dependencies=[Depends(require_staff)])


class ShippingQuoteIn(BaseModel):
    method: str = Field("pickup", max_length=20)
    item_count: int = Field(1, ge=1, le=999)
    name: str | None = Field(None, max_length=120)
    line1: str | None = Field(None, max_length=120)
    line2: str | None = Field(None, max_length=120)
    city: str | None = Field(None, max_length=80)
    region: str | None = Field(None, max_length=40)
    postal: str | None = Field(None, max_length=20)
    country: str | None = Field("US", max_length=2)
    phone: str | None = Field(None, max_length=40)


@router.get("/methods")
def get_shipping_methods():
    return methods_public()


@router.post("/quote")
def post_shipping_quote(body: ShippingQuoteIn):
    dest = {
        "name": body.name or "",
        "line1": body.line1 or "",
        "line2": body.line2 or "",
        "city": body.city or "",
        "region": body.region or "",
        "postal": body.postal or "",
        "country": body.country or "US",
        "phone": body.phone or "",
    }
    return quote(body.method, dest, body.item_count)
