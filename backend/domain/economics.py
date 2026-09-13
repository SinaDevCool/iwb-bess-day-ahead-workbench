from __future__ import annotations

import math
from dataclasses import dataclass

from backend.domain.models import BatteryConfig, MarketConfig


def effective_transaction_fee(market: MarketConfig) -> float:
    """Return only configured marginal costs used by the dispatch decision."""
    exchange = (
        market.exchange_fee_eur_per_mwh if market.exchange_fee_policy == "configured" else 0.0
    )
    return exchange + market.clearing_fee_eur_per_mwh


@dataclass(frozen=True)
class IntervalEconomics:
    grid_energy_mwh: float
    battery_energy_mwh: float
    sales_revenue_eur: float
    purchase_cost_eur: float
    degradation_cost_eur: float
    transaction_fee_eur: float
    contribution_eur: float
    soc_delta_mwh: float


def calculate_interval(
    side: str,
    power_mw: float,
    duration_hours: float,
    price_eur_mwh: float,
    battery: BatteryConfig,
    transaction_fee_eur_per_mwh: float = 0,
) -> IntervalEconomics:
    """Return the canonical grid, battery and financial values for one interval.

    Sales and purchases retain the price sign: negative prices make a BUY
    purchase cost negative (a cash inflow). Contribution is always sales minus
    purchases, battery-side degradation and grid-side transaction fees.
    """
    if side not in {"BUY", "SELL"}:
        raise ValueError("Side must be BUY or SELL")
    if power_mw < 0 or duration_hours <= 0:
        raise ValueError("Power must be non-negative and duration must be positive")
    eta = math.sqrt(battery.round_trip_efficiency)
    grid_energy = power_mw * duration_hours
    battery_energy = grid_energy * eta if side == "BUY" else grid_energy / eta
    market_value = grid_energy * price_eur_mwh
    sales = market_value if side == "SELL" else 0.0
    purchases = market_value if side == "BUY" else 0.0
    degradation = battery_energy * battery.degradation_cost_eur_per_mwh
    transaction_fee = grid_energy * transaction_fee_eur_per_mwh
    contribution = sales - purchases - degradation - transaction_fee
    return IntervalEconomics(
        grid_energy_mwh=grid_energy,
        battery_energy_mwh=battery_energy,
        sales_revenue_eur=sales,
        purchase_cost_eur=purchases,
        degradation_cost_eur=degradation,
        transaction_fee_eur=transaction_fee,
        contribution_eur=contribution,
        soc_delta_mwh=battery_energy if side == "BUY" else -battery_energy,
    )
