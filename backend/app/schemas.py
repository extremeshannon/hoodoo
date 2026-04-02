from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CartItemAdd(BaseModel):
    product_slug: str = Field(..., min_length=1, max_length=80)
    quantity: int = Field(1, ge=1, le=999)
    configuration: dict[str, Any] = Field(default_factory=dict)


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=1, le=999)


class CartItemOut(BaseModel):
    id: int
    product_slug: str
    product_name: str
    category_name: str
    quantity: int
    unit_price: str
    line_total: str
    label: str
    configuration: dict[str, Any]

    model_config = {"from_attributes": True}


class CartOut(BaseModel):
    cart_id: UUID | None = None
    items: list[CartItemOut]
    subtotal: str
    item_count: int  # sum of line quantities
