from __future__ import annotations

from collections import Counter
from datetime import timedelta

from backend.domain.models import (
    MarketConfig,
    Order,
    ValidationFinding,
    ValidationResult,
)
from backend.validation.common import (
    _result,
)


def validate_orders(orders: list[Order], market: MarketConfig) -> ValidationResult:
    findings = []
    ids = Counter(order.order_id for order in orders)
    for order in orders:
        if ids[order.order_id] > 1:
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="duplicate_order",
                    message=f"Duplicate order {order.order_id}",
                )
            )
        if not market.min_price_eur_mwh <= order.limit_price_eur_mwh <= market.max_price_eur_mwh:
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="price_range",
                    message=f"Order {order.order_id} price is outside configured bounds",
                )
            )
        duration = order.delivery_end_utc - order.delivery_start_utc
        if duration != timedelta(minutes=market.product_minutes):
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="duration",
                    message=f"Order {order.order_id} has the wrong product duration",
                )
            )
    return _result(findings)
