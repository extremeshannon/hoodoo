"""Build the public catalog JSON (same shape as legacy data/catalog.json) from ORM rows."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Category, Product, ProductOptionChoice


def _dec(d: Decimal | None) -> float:
    if d is None:
        return 0.0
    return float(d)


def build_catalog_dict(db: Session, meta_override: dict | None = None) -> dict:
    meta = {
        "currency": "USD",
        "currencySymbol": "$",
        "priceDisclaimer": "Guide pricing for retail and small runs. Team, contract, and volume quotes available.",
        "lowStockThreshold": 10,
        "contactEmail": "shannon@hoodooak.com",
        "lastUpdated": None,
    }
    if meta_override:
        meta.update(meta_override)

    q = (
        select(Category)
        .options(
            selectinload(Category.products).selectinload(Product.variants),
            selectinload(Category.products).selectinload(Product.option_groups),
            selectinload(Category.products).selectinload(Product.addons),
        )
        .order_by(Category.sort_order, Category.id)
    )
    cats = db.scalars(q).unique().all()

    # Preload choices for all option groups (second query to avoid N+1)
    group_ids: list[int] = []
    for c in cats:
        for p in c.products:
            for g in p.option_groups:
                group_ids.append(g.id)
    choices_by_group: dict[int, list] = {}
    if group_ids:
        ch_q = select(ProductOptionChoice).where(ProductOptionChoice.option_group_id.in_(group_ids))
        for ch in db.scalars(ch_q).all():
            choices_by_group.setdefault(ch.option_group_id, []).append(ch)

    categories_out: list[dict] = []
    for cat in cats:
        products_out: list[dict] = []
        for p in sorted(cat.products, key=lambda x: (x.sort_order, x.id)):
            row: dict = {
                "id": p.slug,
                "name": p.name,
                "sku": p.sku,
                "summary": p.summary or "",
                "pricingModel": p.pricing_model,
            }
            if p.pricing_model == "variants":
                row["variants"] = [
                    {
                        "id": v.variant_slug,
                        "label": v.label,
                        "price": _dec(v.price),
                        "inventory": v.inventory,
                    }
                    for v in sorted(p.variants, key=lambda x: (x.sort_order, x.id))
                ]
                row["addons"] = [
                    {
                        "id": a.addon_key,
                        "label": a.label,
                        "price": _dec(a.price),
                        "inventory": a.inventory,
                    }
                    for a in sorted(p.addons, key=lambda x: (x.sort_order, x.id))
                ]
            elif p.pricing_model == "options":
                row["basePrice"] = _dec(p.base_price or Decimal("0"))
                row["optionGroups"] = []
                for g in sorted(p.option_groups, key=lambda x: (x.sort_order, x.id)):
                    chs = choices_by_group.get(g.id, [])
                    row["optionGroups"].append(
                        {
                            "id": g.group_key,
                            "label": g.label,
                            "required": g.required,
                            "choices": [
                                {
                                    "id": c.choice_key,
                                    "label": c.label,
                                    "priceAdjust": _dec(c.price_adjust),
                                    "inventory": c.inventory,
                                }
                                for c in sorted(chs, key=lambda x: (x.sort_order, x.id))
                            ],
                        }
                    )
                row["addons"] = [
                    {
                        "id": a.addon_key,
                        "label": a.label,
                        "price": _dec(a.price),
                        "inventory": a.inventory,
                    }
                    for a in sorted(p.addons, key=lambda x: (x.sort_order, x.id))
                ]
            products_out.append(row)

        categories_out.append(
            {
                "id": cat.slug,
                "name": cat.name,
                "subtitle": cat.subtitle or "",
                "featured": cat.featured,
                "description": cat.description or "",
                "products": products_out,
            }
        )

    return {"meta": meta, "categories": categories_out}
