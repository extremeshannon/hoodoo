from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import require_admin, require_staff
from app.models import (
    DyeSubArt,
    DyeSubJob,
    Garment3dAsset,
    Order,
    Product,
    ProductAddon,
    ProductOptionChoice,
    ProductOptionGroup,
    ProductVariant,
    ScreenPrintArt,
    ScreenPrintJob,
    EmbroideryArt,
    EmbroideryJob,
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
from app.shipping import fulfillment_label, money

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


class AdminCustomerOut(BaseModel):
    id: UUID
    email: str
    username: str | None
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime
    order_count: int
    print_count: int


class AdminOrderOut(BaseModel):
    id: UUID
    status: str
    subtotal: str
    total: str
    customer_note: str | None
    created_at: datetime
    owner_id: UUID
    owner_email: str
    owner_name: str | None
    line_count: int
    fulfillment_label: str = ""


class AdminPrintOut(BaseModel):
    id: UUID
    name: str
    garment_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    owner_id: UUID
    owner_email: str
    owner_name: str | None
    art_count: int
    notes: str | None = None
    kind: str = "dyesub"


class AdminShopOut(BaseModel):
    customers: list[AdminCustomerOut]
    orders: list[AdminOrderOut]
    prints: list[AdminPrintOut]


class AdminStatusPatch(BaseModel):
    status: str = Field(..., max_length=40)


def _order_status_label(o: Order) -> str:
    ful = getattr(o, "fulfillment", None)
    return fulfillment_label(ful if isinstance(ful, dict) else None)


@router.get("/shop", response_model=AdminShopOut)
def admin_shop(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    order_counts = dict(db.execute(select(Order.user_id, func.count(Order.id)).group_by(Order.user_id)).all())
    dyesub_counts = dict(db.execute(select(DyeSubJob.user_id, func.count(DyeSubJob.id)).group_by(DyeSubJob.user_id)).all())
    screen_counts = dict(
        db.execute(select(ScreenPrintJob.user_id, func.count(ScreenPrintJob.id)).group_by(ScreenPrintJob.user_id)).all()
    )
    em_counts = dict(
        db.execute(select(EmbroideryJob.user_id, func.count(EmbroideryJob.id)).group_by(EmbroideryJob.user_id)).all()
    )
    customers = [
        AdminCustomerOut(
            id=u.id,
            email=u.email,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            is_active=bool(u.is_active),
            created_at=u.created_at,
            order_count=int(order_counts.get(u.id) or 0),
            print_count=int(dyesub_counts.get(u.id) or 0) + int(screen_counts.get(u.id) or 0) + int(em_counts.get(u.id) or 0),
        )
        for u in users
    ]

    orders = db.scalars(
        select(Order).options(selectinload(Order.user), selectinload(Order.lines)).order_by(Order.created_at.desc())
    ).unique().all()
    order_rows = []
    for o in orders:
        ful = getattr(o, "fulfillment", None)
        total = getattr(o, "total", None)
        order_rows.append(
            AdminOrderOut(
                id=o.id,
                status=o.status,
                subtotal=money(o.subtotal),
                total=money(total if total is not None else o.subtotal),
                customer_note=o.customer_note,
                created_at=o.created_at,
                owner_id=o.user_id,
                owner_email=o.user.email if o.user else "",
                owner_name=o.user.full_name if o.user else None,
                line_count=len(o.lines or []),
                fulfillment_label=_order_status_label(o),
            )
        )

    art_counts = dict(db.execute(select(DyeSubArt.job_id, func.count(DyeSubArt.id)).group_by(DyeSubArt.job_id)).all())
    jobs = db.scalars(
        select(DyeSubJob).options(selectinload(DyeSubJob.user)).order_by(DyeSubJob.updated_at.desc())
    ).unique().all()
    prints = [
        AdminPrintOut(
            id=j.id,
            name=j.name,
            garment_id=j.garment_id,
            status=j.status,
            created_at=j.created_at,
            updated_at=j.updated_at,
            owner_id=j.user_id,
            owner_email=j.user.email if j.user else "",
            owner_name=j.user.full_name if j.user else None,
            art_count=int(art_counts.get(j.id) or 0),
            notes=j.notes,
            kind="dyesub",
        )
        for j in jobs
    ]
    sp_art_counts = dict(
        db.execute(select(ScreenPrintArt.job_id, func.count(ScreenPrintArt.id)).group_by(ScreenPrintArt.job_id)).all()
    )
    sp_jobs = db.scalars(
        select(ScreenPrintJob).options(selectinload(ScreenPrintJob.user)).order_by(ScreenPrintJob.updated_at.desc())
    ).unique().all()
    prints.extend(
        [
            AdminPrintOut(
                id=j.id,
                name=j.name,
                garment_id=j.garment_id,
                status=j.status,
                created_at=j.created_at,
                updated_at=j.updated_at,
                owner_id=j.user_id,
                owner_email=j.user.email if j.user else "",
                owner_name=j.user.full_name if j.user else None,
                art_count=int(sp_art_counts.get(j.id) or 0),
                notes=j.notes,
                kind="screenprint",
            )
            for j in sp_jobs
        ]
    )
    em_art_counts = dict(
        db.execute(select(EmbroideryArt.job_id, func.count(EmbroideryArt.id)).group_by(EmbroideryArt.job_id)).all()
    )
    em_jobs = db.scalars(
        select(EmbroideryJob).options(selectinload(EmbroideryJob.user)).order_by(EmbroideryJob.updated_at.desc())
    ).unique().all()
    prints.extend(
        [
            AdminPrintOut(
                id=j.id,
                name=j.name,
                garment_id=j.garment_id,
                status=j.status,
                created_at=j.created_at,
                updated_at=j.updated_at,
                owner_id=j.user_id,
                owner_email=j.user.email if j.user else "",
                owner_name=j.user.full_name if j.user else None,
                art_count=int(em_art_counts.get(j.id) or 0),
                notes=j.notes,
                kind="embroidery",
            )
            for j in em_jobs
        ]
    )
    prints.sort(key=lambda r: r.updated_at, reverse=True)
    return AdminShopOut(customers=customers, orders=order_rows, prints=prints)


@router.patch("/orders/{order_id}", response_model=AdminOrderOut)
def admin_patch_order(
    order_id: UUID,
    body: AdminStatusPatch,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    o = db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.user), selectinload(Order.lines)))
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    o.status = body.status.strip() or o.status
    db.commit()
    o = db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.user), selectinload(Order.lines)))
    assert o is not None
    total = getattr(o, "total", None)
    return AdminOrderOut(
        id=o.id,
        status=o.status,
        subtotal=money(o.subtotal),
        total=money(total if total is not None else o.subtotal),
        customer_note=o.customer_note,
        created_at=o.created_at,
        owner_id=o.user_id,
        owner_email=o.user.email if o.user else "",
        owner_name=o.user.full_name if o.user else None,
        line_count=len(o.lines or []),
        fulfillment_label=_order_status_label(o),
    )


@router.patch("/prints/{job_id}", response_model=AdminPrintOut)
def admin_patch_print(
    job_id: UUID,
    body: AdminStatusPatch,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    job = db.scalar(select(DyeSubJob).where(DyeSubJob.id == job_id).options(selectinload(DyeSubJob.user)))
    kind = "dyesub"
    if not job:
        job = db.scalar(
            select(ScreenPrintJob).where(ScreenPrintJob.id == job_id).options(selectinload(ScreenPrintJob.user))
        )
        kind = "screenprint"
    if not job:
        job = db.scalar(
            select(EmbroideryJob).where(EmbroideryJob.id == job_id).options(selectinload(EmbroideryJob.user))
        )
        kind = "embroidery"
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Print job not found")
    job.status = body.status.strip() or job.status
    db.commit()
    if kind == "screenprint":
        art_count = db.scalar(select(func.count(ScreenPrintArt.id)).where(ScreenPrintArt.job_id == job.id)) or 0
    elif kind == "embroidery":
        art_count = db.scalar(select(func.count(EmbroideryArt.id)).where(EmbroideryArt.job_id == job.id)) or 0
    else:
        art_count = db.scalar(select(func.count(DyeSubArt.id)).where(DyeSubArt.job_id == job.id)) or 0
    return AdminPrintOut(
        id=job.id,
        name=job.name,
        garment_id=job.garment_id,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        owner_id=job.user_id,
        owner_email=job.user.email if job.user else "",
        owner_name=job.user.full_name if job.user else None,
        art_count=int(art_count),
        notes=job.notes,
        kind=kind,
    )
