"""horizon service: one responsibility within optimization."""

from __future__ import annotations

from datetime import datetime, timedelta

from backend.domain.economics import effective_transaction_fee
from backend.domain.models import SimulationRequest
from backend.services.forecast_service import build_demo_forecast


def resolve_terminal_value(request: SimulationRequest) -> float:
    """Resolve the configured continuation value without pretending it is market data."""
    if request.horizon_policy == "minimum_reserve":
        return 0.0
    if request.horizon_policy == "terminal_value":
        return request.terminal_value_eur_per_mwh
    next_date = (datetime.strptime(request.delivery_date, "%Y-%m-%d") + timedelta(days=1)).strftime(
        "%Y-%m-%d"
    )
    next_prices = build_demo_forecast(next_date, request.market)
    count = max(1, int(request.lookahead_hours * 60 / request.market.product_minutes))
    # Replacement-value proxy from the early next-day forecast. It is exposed
    # explicitly as illustrative in the API/UI, not mixed into cash contribution.
    window = next_prices[:count]
    if request.horizon_policy == "multi_day":
        # Opportunity value of stored energy over the explicit continuation
        # window, net of one discharge's marginal wear and execution costs.
        gross = max(p.price_eur_mwh for p in window) * request.battery.round_trip_efficiency
        return round(
            max(
                0,
                gross
                - request.battery.degradation_cost_eur_per_mwh
                - effective_transaction_fee(request.market),
            ),
            2,
        )
    return round(sum(p.price_eur_mwh for p in window) / min(count, len(next_prices)), 2)
