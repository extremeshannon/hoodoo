"""Load legacy data/catalog.json into PostgreSQL."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Product,
    ProductAddon,
    ProductOptionChoice,
    ProductOptionGroup,
    ProductVariant,
)


def seed_from_catalog_json(db: Session, path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    categories = data.get("categories") or []
    for ci, cat in enumerate(categories):
        c = Category(
            slug=cat["id"],
            name=cat["name"],
            subtitle=cat.get("subtitle") or None,
            description=cat.get("description") or None,
            featured=bool(cat.get("featured")),
            sort_order=ci,
        )
        db.add(c)
        db.flush()
        for pi, p in enumerate(cat.get("products") or []):
            pricing = p["pricingModel"]
            prod = Product(
                slug=p["id"],
                category_id=c.id,
                sku=p.get("sku") or p["id"].upper(),
                name=p["name"],
                summary=p.get("summary"),
                pricing_model=pricing,
                base_price=Decimal(str(p["basePrice"])) if pricing == "options" else None,
                sort_order=pi,
            )
            db.add(prod)
            db.flush()
            if pricing == "variants":
                for vi, v in enumerate(p.get("variants") or []):
                    db.add(
                        ProductVariant(
                            product_id=prod.id,
                            variant_slug=v["id"],
                            label=v["label"],
                            price=Decimal(str(v["price"])),
                            inventory=int(v.get("inventory") or 0),
                            sort_order=vi,
                        )
                    )
                for ai, a in enumerate(p.get("addons") or []):
                    db.add(
                        ProductAddon(
                            product_id=prod.id,
                            addon_key=a["id"],
                            label=a["label"],
                            price=Decimal(str(a["price"])),
                            inventory=int(a.get("inventory") or 0),
                            sort_order=ai,
                        )
                    )
            elif pricing == "options":
                for gi, g in enumerate(p.get("optionGroups") or []):
                    og = ProductOptionGroup(
                        product_id=prod.id,
                        group_key=g["id"],
                        label=g["label"],
                        required=bool(g.get("required", True)),
                        sort_order=gi,
                    )
                    db.add(og)
                    db.flush()
                    for ci2, ch in enumerate(g.get("choices") or []):
                        db.add(
                            ProductOptionChoice(
                                option_group_id=og.id,
                                choice_key=ch["id"],
                                label=ch["label"],
                                price_adjust=Decimal(str(ch.get("priceAdjust") or 0)),
                                inventory=int(ch.get("inventory") or 0),
                                sort_order=ci2,
                            )
                        )
                for ai, a in enumerate(p.get("addons") or []):
                    db.add(
                        ProductAddon(
                            product_id=prod.id,
                            addon_key=a["id"],
                            label=a["label"],
                            price=Decimal(str(a["price"])),
                            inventory=int(a.get("inventory") or 0),
                            sort_order=ai,
                        )
                    )
    db.commit()


def seed_if_empty(db: Session, catalog_path: Path) -> bool:
    n = db.scalar(select(func.count()).select_from(Category))
    if n and n > 0:
        return False
    if not catalog_path.is_file():
        return False
    seed_from_catalog_json(db, catalog_path)
    return True
