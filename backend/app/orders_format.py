"""Serialize Order ORM rows to API schemas."""

from __future__ import annotations

from app.models import Order
from app.schemas import FulfillmentOut, OrderLineOut, OrderOut
from app.shipping import fulfillment_label, money


def order_to_out(o: Order) -> OrderOut:
    lines = [
        OrderLineOut(
            id=line.id,
            product_slug=line.product_slug_snapshot,
            product_name=line.product_name_snapshot,
            quantity=line.quantity,
            unit_price=f"{line.unit_price:.2f}",
            line_total=f"{line.line_total:.2f}",
            label=line.label_snapshot,
            configuration=line.configuration,
        )
        for line in o.lines
    ]
    ful = o.fulfillment if isinstance(o.fulfillment, dict) else None
    ship = o.shipping_amount if o.shipping_amount is not None else 0
    total = o.total if o.total is not None else o.subtotal
    ful_out = FulfillmentOut.model_validate(ful) if ful and ful.get("method") else None
    return OrderOut(
        id=o.id,
        status=o.status,
        subtotal=money(o.subtotal),
        shipping=money(ship),
        total=money(total),
        fulfillment=ful_out,
        fulfillment_label=fulfillment_label(ful),
        customer_note=o.customer_note,
        created_at=o.created_at,
        lines=lines,
    )
