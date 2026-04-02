from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.models import Cart, CartItem, Product
from app.pricing import PricingError, compute_line, load_product_for_pricing, validate_quantity
from app.schemas import CartItemAdd, CartItemOut, CartItemUpdate, CartOut

router = APIRouter(prefix="/cart", tags=["cart"])


def _parse_cart_cookie(request: Request) -> uuid.UUID | None:
    settings = get_settings()
    raw = request.cookies.get(settings.cart_cookie_name)
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _set_cart_cookie(response: Response, cart_id: uuid.UUID) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.cart_cookie_name,
        value=str(cart_id),
        max_age=settings.cart_cookie_max_age,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _get_or_create_cart(db: Session, request: Request, response: Response | None) -> Cart:
    cid = _parse_cart_cookie(request)
    if cid:
        cart = db.get(Cart, cid)
        if cart:
            return cart
    cart = Cart()
    db.add(cart)
    db.commit()
    db.refresh(cart)
    if response is not None:
        _set_cart_cookie(response, cart.id)
    return cart


def _serialize_cart(db: Session, cart: Cart) -> CartOut:
    items_out: list[CartItemOut] = []
    sub = Decimal("0")
    count = 0
    db.refresh(cart)
    q = (
        select(CartItem)
        .where(CartItem.cart_id == cart.id)
        .options(selectinload(CartItem.product).selectinload(Product.category))
        .order_by(CartItem.id)
    )
    for line in db.scalars(q).all():
        product = line.product
        if not product:
            continue
        try:
            unit, label, _ = compute_line(db, product, line.configuration)
        except PricingError:
            unit, label = Decimal("0"), "Invalid configuration (please remove)"
        line_total = unit * line.quantity
        sub += line_total
        count += line.quantity
        items_out.append(
            CartItemOut(
                id=line.id,
                product_slug=product.slug,
                product_name=product.name,
                category_name=product.category.name if product.category else "",
                quantity=line.quantity,
                unit_price=f"{unit:.2f}",
                line_total=f"{line_total:.2f}",
                label=label,
                configuration=line.configuration,
            )
        )
    return CartOut(
        cart_id=cart.id,
        items=items_out,
        subtotal=f"{sub:.2f}",
        item_count=count,
    )


@router.get("", response_model=CartOut)
def get_cart(request: Request, db: Session = Depends(get_db)):
    cid = _parse_cart_cookie(request)
    if not cid:
        return CartOut(cart_id=None, items=[], subtotal="0.00", item_count=0)
    cart = db.get(Cart, cid)
    if not cart:
        return CartOut(cart_id=None, items=[], subtotal="0.00", item_count=0)
    return _serialize_cart(db, cart)


@router.post("/items", response_model=CartOut)
def add_cart_item(
    request: Request,
    response: Response,
    body: CartItemAdd,
    db: Session = Depends(get_db),
):
    product = load_product_for_pricing(db, body.product_slug)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        validate_quantity(body.quantity)
        compute_line(db, product, body.configuration)
    except PricingError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    cart = _get_or_create_cart(db, request, response)
    item = CartItem(
        cart_id=cart.id,
        product_id=product.id,
        quantity=body.quantity,
        configuration=body.configuration,
    )
    db.add(item)
    db.commit()
    return _serialize_cart(db, cart)


@router.patch("/items/{item_id}", response_model=CartOut)
def update_cart_item(
    request: Request,
    item_id: int,
    body: CartItemUpdate,
    db: Session = Depends(get_db),
):
    cid = _parse_cart_cookie(request)
    if not cid:
        raise HTTPException(status_code=404, detail="Cart not found")
    cart = db.get(Cart, cid)
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    item = db.get(CartItem, item_id)
    if not item or item.cart_id != cart.id:
        raise HTTPException(status_code=404, detail="Line not found")
    try:
        validate_quantity(body.quantity)
        prod_row = db.get(Product, item.product_id)
        if not prod_row:
            raise HTTPException(status_code=400, detail="Product missing")
        product = load_product_for_pricing(db, prod_row.slug)
        if not product:
            raise HTTPException(status_code=400, detail="Product not found")
        compute_line(db, product, item.configuration)
    except PricingError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    item.quantity = body.quantity
    db.commit()
    return _serialize_cart(db, cart)


@router.delete("/items/{item_id}", response_model=CartOut)
def delete_cart_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    cid = _parse_cart_cookie(request)
    if not cid:
        raise HTTPException(status_code=404, detail="Cart not found")
    cart = db.get(Cart, cid)
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    item = db.get(CartItem, item_id)
    if not item or item.cart_id != cart.id:
        raise HTTPException(status_code=404, detail="Line not found")
    db.delete(item)
    db.commit()
    return _serialize_cart(db, cart)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_cart(request: Request, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    cid = _parse_cart_cookie(request)
    if cid:
        cart = db.get(Cart, cid)
        if cart:
            db.delete(cart)
            db.commit()
    response.delete_cookie(settings.cart_cookie_name, path="/")
    return response
