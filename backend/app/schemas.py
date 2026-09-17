from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import re

from pydantic import BaseModel, EmailStr, Field

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,32}$")


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


class FulfillmentOut(BaseModel):
    method: str
    rate_id: str | None = None
    rate_label: str
    shipping_amount: str
    quoted: bool = False
    needs_address: bool = False
    detail: str = ""
    pickup: dict[str, Any] | None = None
    destination: dict[str, Any] | None = None
    zone_id: str | None = None


class CartFulfillmentIn(BaseModel):
    method: str = Field("pickup", max_length=20)
    name: str | None = Field(None, max_length=120)
    line1: str | None = Field(None, max_length=120)
    line2: str | None = Field(None, max_length=120)
    city: str | None = Field(None, max_length=80)
    region: str | None = Field(None, max_length=40)
    postal: str | None = Field(None, max_length=20)
    country: str | None = Field("US", max_length=2)
    phone: str | None = Field(None, max_length=40)


class CartOut(BaseModel):
    cart_id: UUID | None = None
    items: list[CartItemOut]
    subtotal: str
    shipping: str = "0.00"
    total: str = "0.00"
    item_count: int  # sum of line quantities
    fulfillment: FulfillmentOut | None = None


# --- Auth & users ---


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=255)
    username: str | None = Field(None, max_length=32, description="Optional unique handle for login (stored lowercase).")


class UserOut(BaseModel):
    id: UUID
    email: str
    username: str | None
    full_name: str | None
    role: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ForgotPasswordOut(BaseModel):
    message: str


class ResetPasswordIn(BaseModel):
    token: str = Field(..., min_length=16, max_length=512)
    password: str = Field(..., min_length=8, max_length=128)


class ResetPasswordOut(BaseModel):
    message: str


# --- Orders ---


class OrderCreateLineIn(BaseModel):
    product_slug: str = Field(..., min_length=1, max_length=80)
    quantity: int = Field(..., ge=1, le=999)
    configuration: dict[str, Any] = Field(default_factory=dict)


class OrderCreateIn(BaseModel):
    lines: list[OrderCreateLineIn] = Field(..., min_length=1)
    customer_note: str | None = Field(None, max_length=2000)
    fulfillment: CartFulfillmentIn | None = None


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
    shipping: str = "0.00"
    total: str = "0.00"
    fulfillment: FulfillmentOut | None = None
    fulfillment_label: str = ""
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


# --- Admin (staff) ---


class InventoryPatch(BaseModel):
    inventory: int = Field(..., ge=0, le=999999)


class VariantInventoryRow(BaseModel):
    id: int
    product_slug: str
    product_name: str
    label: str
    inventory: int


class ChoiceInventoryRow(BaseModel):
    id: int
    product_slug: str
    product_name: str
    group_label: str
    choice_label: str
    inventory: int


class AddonInventoryRow(BaseModel):
    id: int
    product_slug: str
    product_name: str
    label: str
    inventory: int


class InventoryAdminOut(BaseModel):
    variant_rows: list[VariantInventoryRow]
    choice_rows: list[ChoiceInventoryRow]
    addon_rows: list[AddonInventoryRow]


class Garment3dAssetCreate(BaseModel):
    kind: str = Field(..., min_length=1, max_length=40)
    uri: str = Field(..., min_length=1, max_length=1024)
    label: str | None = Field(None, max_length=255)
    sort_order: int = Field(0, ge=-100000, le=100000)


class Garment3dAssetUpdate(BaseModel):
    kind: str | None = Field(None, max_length=40)
    uri: str | None = Field(None, max_length=1024)
    label: str | None = Field(None, max_length=255)
    sort_order: int | None = Field(None, ge=-100000, le=100000)
