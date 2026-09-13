"""Proposal revision, validation and approval; independent of the HTTP transport."""

from __future__ import annotations


from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import (
    BatteryConfig,
    MarketConfig,
)


def reprice_order(order: dict, payload: dict) -> None:
    """Limits govern eligibility; this proposal ledger is valued at its expected price."""
    market = MarketConfig.model_validate(payload["market"])
    economics = calculate_interval(
        order["side"],
        order["volume_mw"],
        market.product_minutes / 60,
        order["expected_price_eur_mwh"],
        BatteryConfig.model_validate(payload["battery"]),
        effective_transaction_fee(market),
    )
    order["sales_revenue_eur"] = round(economics.sales_revenue_eur, 2)
    order["purchase_cost_eur"] = round(economics.purchase_cost_eur, 2)
    order["degradation_cost_eur"] = round(economics.degradation_cost_eur, 2)
    order["transaction_fee_eur"] = round(economics.transaction_fee_eur, 2)
    order["expected_contribution_eur"] = round(
        order["sales_revenue_eur"]
        - order["purchase_cost_eur"]
        - order["degradation_cost_eur"]
        - order["transaction_fee_eur"],
        2,
    )
