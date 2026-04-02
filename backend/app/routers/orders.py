from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Order, OrderLine, User
from app.orders_format import order_to_out
from app.pricing import PricingError, compute_line, load_product_for_pricing
from app.schemas import OrderCreateIn, OrderOut

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
def list_my_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        select(Order)
        .where(Order.user_id == user.id)
        .options(selectinload(Order.lines))
        .order_by(Order.created_at.desc())
    )
    orders = db.scalars(q).unique().all()
    return [order_to_out(o) for o in orders]


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    o = db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.lines)))
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if o.user_id != user.id and user.role not in ("staff", "admin"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order_to_out(o)


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    body: OrderCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Persist a configured quote / order for history and reorders.
    (Later: checkout can call this after payment; for now it is the submission record.)
    """
    subtotal = Decimal("0")
    pending: list[tuple] = []
    for line in body.lines:
        product = load_product_for_pricing(db, line.product_slug)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown product: {line.product_slug}",
            )
        try:
            unit, label, _ = compute_line(db, product, line.configuration)
        except PricingError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        line_total = unit * line.quantity
        subtotal += line_total
        pending.append((product, line.quantity, line.configuration, unit, line_total, label))

    order = Order(
        user_id=user.id,
        status="submitted",
        subtotal=subtotal,
        customer_note=body.customer_note,
    )
    db.add(order)
    db.flush()

    for product, qty, cfg, unit, lt, label in pending:
        db.add(
            OrderLine(
                order_id=order.id,
                product_id=product.id,
                product_slug_snapshot=product.slug,
                product_name_snapshot=product.name,
                quantity=qty,
                configuration=cfg,
                unit_price=unit,
                line_total=lt,
                label_snapshot=label,
            )
        )
    db.commit()
    o = db.scalar(select(Order).where(Order.id == order.id).options(selectinload(Order.lines)))
    assert o is not None
    return order_to_out(o)
