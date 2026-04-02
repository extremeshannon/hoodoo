from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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


# --- Auth & users ---


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=255)


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Orders ---


class OrderCreateLineIn(BaseModel):
    product_slug: str = Field(..., min_length=1, max_length=80)
    quantity: int = Field(..., ge=1, le=999)
    configuration: dict[str, Any] = Field(default_factory=dict)


class OrderCreateIn(BaseModel):
    lines: list[OrderCreateLineIn] = Field(..., min_length=1)
    customer_note: str | None = Field(None, max_length=2000)


class OrderLineOut(BaseModel):
    id: int
    product_slug: str
    product_name: str
    quantity: int
    unit_price: str
    line_total: str
    label: str
    configuration: dict[str, Any]

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: UUID
    status: str
    subtotal: str
    customer_note: str | None
    created_at: datetime
    lines: list[OrderLineOut]

    model_config = {"from_attributes": True}


# --- 3D assets (CLO3D / glTF pipeline) ---


class Garment3dAssetOut(BaseModel):
    id: int
    kind: str
    uri: str
    label: str | None
    sort_order: int

    model_config = {"from_attributes": True}
