"""Validate cart configuration and compute unit price, stock, and display label."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from app.models import Product, ProductOptionChoice


class PricingError(ValueError):
    pass


def load_product_for_pricing(db: Session, product_slug: str) -> Product | None:
    q = (
        select(Product)
        .where(Product.slug == product_slug)
        .options(
            selectinload(Product.variants),
            selectinload(Product.option_groups),
            selectinload(Product.addons),
        )
    )
    return db.scalars(q).first()


def compute_line(
    db: Session,
    product: Product,
    configuration: dict[str, Any],
) -> tuple[Decimal, str, int | None]:
    """
    Returns (unit_price, label, stock_qty or None if indeterminate).
    """
    cfg = configuration or {}
    variant_id = cfg.get("variant_id")
    option_selections: dict[str, str] = dict(cfg.get("option_selections") or {})
    addon_ids: list[str] = list(cfg.get("addon_ids") or [])

    unit = Decimal("0")
    parts: list[str] = [product.name]
    stock: int | None = None

    if product.pricing_model == "variants":
        if not variant_id:
            raise PricingError("variant_id is required for this product")
        v = next((x for x in product.variants if x.variant_slug == variant_id), None)
        if not v:
            raise PricingError("Unknown variant")
        unit = v.price
        parts.append(v.label)
        stock = v.inventory
    elif product.pricing_model == "options":
        base = product.base_price or Decimal("0")
        unit = base
        mins: list[int] = []
        for g in sorted(product.option_groups, key=lambda x: (x.sort_order, x.id)):
            key = g.group_key
            if g.required and key not in option_selections:
                raise PricingError(f"Missing option group: {g.label}")
            ck = option_selections.get(key)
            if ck is None:
                continue
            choice = _find_choice(db, g.id, ck)
            if not choice:
                raise PricingError(f"Invalid choice for {g.label}")
            unit += choice.price_adjust
            parts.append(f"{g.label}: {choice.label}")
            mins.append(choice.inventory)
        if mins:
            stock = min(mins)
    else:
        raise PricingError("Unknown pricing model")

    addon_total = Decimal("0")
    for ak in addon_ids:
        a = next((x for x in product.addons if x.addon_key == ak), None)
        if not a:
            raise PricingError(f"Unknown add-on: {ak}")
        addon_total += a.price
        parts.append(f"+ {a.label}")
        if stock is not None and a.inventory < 999:
            stock = min(stock, a.inventory)

    unit += addon_total
    label = " · ".join(parts)
    return unit, label, stock


def _find_choice(db: Session, group_id: int, choice_key: str) -> ProductOptionChoice | None:
    q = select(ProductOptionChoice).where(
        ProductOptionChoice.option_group_id == group_id,
        ProductOptionChoice.choice_key == choice_key,
    )
    return db.scalars(q).first()


def validate_quantity(qty: int) -> int:
    if qty < 1 or qty > 999:
        raise PricingError("Quantity must be between 1 and 999")
    return qty
