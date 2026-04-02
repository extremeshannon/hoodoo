from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_staff
from app.models import (
    Garment3dAsset,
    Product,
    ProductAddon,
    ProductOptionChoice,
    ProductOptionGroup,
    ProductVariant,
    User,
)
from app.schemas import (
    AddonInventoryRow,
    ChoiceInventoryRow,
    Garment3dAssetCreate,
    Garment3dAssetOut,
    Garment3dAssetUpdate,
    InventoryAdminOut,
    InventoryPatch,
    VariantInventoryRow,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _product_or_404(db: Session, slug: str) -> Product:
    p = db.scalar(select(Product).where(Product.slug == slug))
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return p


@router.get("/inventory", response_model=InventoryAdminOut)
def list_inventory(
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    variant_rows: list[VariantInventoryRow] = []
    qv = (
        select(ProductVariant, Product)
        .join(Product, ProductVariant.product_id == Product.id)
        .order_by(Product.slug, ProductVariant.sort_order, ProductVariant.id)
    )
    for v, p in db.execute(qv).all():
        variant_rows.append(
            VariantInventoryRow(
                id=v.id,
                product_slug=p.slug,
                product_name=p.name,
                label=v.label,
                inventory=v.inventory,
            )
        )

    choice_rows: list[ChoiceInventoryRow] = []
    qc = (
        select(ProductOptionChoice, ProductOptionGroup, Product)
        .join(ProductOptionGroup, ProductOptionChoice.option_group_id == ProductOptionGroup.id)
        .join(Product, ProductOptionGroup.product_id == Product.id)
        .order_by(Product.slug, ProductOptionGroup.sort_order, ProductOptionChoice.sort_order)
    )
    for c, g, p in db.execute(qc).all():
        choice_rows.append(
            ChoiceInventoryRow(
                id=c.id,
                product_slug=p.slug,
                product_name=p.name,
                group_label=g.label,
                choice_label=c.label,
                inventory=c.inventory,
            )
        )

    addon_rows: list[AddonInventoryRow] = []
    qa = (
        select(ProductAddon, Product)
        .join(Product, ProductAddon.product_id == Product.id)
        .order_by(Product.slug, ProductAddon.sort_order, ProductAddon.id)
    )
    for a, p in db.execute(qa).all():
        addon_rows.append(
            AddonInventoryRow(
                id=a.id,
                product_slug=p.slug,
                product_name=p.name,
                label=a.label,
                inventory=a.inventory,
            )
        )

    return InventoryAdminOut(
        variant_rows=variant_rows,
        choice_rows=choice_rows,
        addon_rows=addon_rows,
    )


@router.patch("/inventory/variant/{variant_id}", response_model=VariantInventoryRow)
def patch_variant_inventory(
    variant_id: int,
    body: InventoryPatch,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    v = db.get(ProductVariant, variant_id)
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    p = db.get(Product, v.product_id)
    assert p is not None
    v.inventory = body.inventory
    db.commit()
    db.refresh(v)
    return VariantInventoryRow(
        id=v.id,
        product_slug=p.slug,
        product_name=p.name,
        label=v.label,
        inventory=v.inventory,
    )


@router.patch("/inventory/choice/{choice_id}", response_model=ChoiceInventoryRow)
def patch_choice_inventory(
    choice_id: int,
    body: InventoryPatch,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    c = db.get(ProductOptionChoice, choice_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option choice not found")
    g = db.get(ProductOptionGroup, c.option_group_id)
    assert g is not None
    p = db.get(Product, g.product_id)
    assert p is not None
    c.inventory = body.inventory
    db.commit()
    db.refresh(c)
    return ChoiceInventoryRow(
        id=c.id,
        product_slug=p.slug,
        product_name=p.name,
        group_label=g.label,
        choice_label=c.label,
        inventory=c.inventory,
    )


@router.patch("/inventory/addon/{addon_id}", response_model=AddonInventoryRow)
def patch_addon_inventory(
    addon_id: int,
    body: InventoryPatch,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    a = db.get(ProductAddon, addon_id)
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Addon not found")
    p = db.get(Product, a.product_id)
    assert p is not None
    a.inventory = body.inventory
    db.commit()
    db.refresh(a)
    return AddonInventoryRow(
        id=a.id,
        product_slug=p.slug,
        product_name=p.name,
        label=a.label,
        inventory=a.inventory,
    )


@router.get("/products/{slug}/3d-assets", response_model=list[Garment3dAssetOut])
def admin_list_3d(
    slug: str,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    product = _product_or_404(db, slug)
    rows = db.scalars(
        select(Garment3dAsset)
        .where(Garment3dAsset.product_id == product.id)
        .order_by(Garment3dAsset.sort_order, Garment3dAsset.id)
    ).all()
    return list(rows)


@router.post("/products/{slug}/3d-assets", response_model=Garment3dAssetOut, status_code=status.HTTP_201_CREATED)
def admin_create_3d(
    slug: str,
    body: Garment3dAssetCreate,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    product = _product_or_404(db, slug)
    row = Garment3dAsset(
        product_id=product.id,
        kind=body.kind,
        uri=body.uri,
        label=body.label,
        sort_order=body.sort_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/3d-assets/{asset_id}", response_model=Garment3dAssetOut)
def admin_patch_3d(
    asset_id: int,
    body: Garment3dAssetUpdate,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    row = db.get(Garment3dAsset, asset_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    data = body.model_dump(exclude_unset=True)
    for k, val in data.items():
        setattr(row, k, val)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/3d-assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_3d(
    asset_id: int,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Response:
    row = db.get(Garment3dAsset, asset_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
