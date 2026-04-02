"""Serialize Order ORM rows to API schemas."""

from __future__ import annotations

from app.models import Order
from app.schemas import OrderLineOut, OrderOut


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
    return OrderOut(
        id=o.id,
        status=o.status,
        subtotal=f"{o.subtotal:.2f}",
        customer_note=o.customer_note,
        created_at=o.created_at,
        lines=lines,
    )
