from __future__ import annotations

from datetime import timedelta
import math
from zoneinfo import ZoneInfo

from backend.domain.economics import calculate_interval
from backend.domain.models import BatteryConfig, DispatchRow, MarketConfig, Order


def build_orders(simulation_id: str, rows: list[DispatchRow], market: MarketConfig, battery: BatteryConfig):
    orders = []
    transaction_fee = market.exchange_fee_eur_per_mwh + market.clearing_fee_eur_per_mwh
    zone = ZoneInfo(market.timezone)
    for row in rows:
        if row.action == "idle" or abs(row.power_mw) < 1e-8:
            continue
        side = "BUY" if row.action == "charge" else "SELL"
        # Never round a continuous dispatch upward into an order the physical
        # schedule did not reserve capacity for.
        volume = _floor_increment(abs(row.power_mw), market.volume_increment_mw)
        if volume <= 0:
            continue
        price = _round_increment(row.price_eur_mwh, market.price_increment_eur_mwh)
        start = row.timestamp_utc
        end = start + timedelta(minutes=market.product_minutes)
        economics = calculate_interval(side, volume, market.product_minutes / 60, row.price_eur_mwh, battery, transaction_fee)
        sales = round(economics.sales_revenue_eur, 2)
        purchases = round(economics.purchase_cost_eur, 2)
        degradation = round(economics.degradation_cost_eur, 2)
        fees = round(economics.transaction_fee_eur, 2)
        contribution = round(sales - purchases - degradation - fees, 2)
        orders.append(Order(
            order_id=f"IWB-DA-{start.strftime('%Y%m%d')}-{row.interval + 1:03d}-{side}",
            delivery_start_utc=start,
            delivery_end_utc=end,
            delivery_local=start.astimezone(zone).strftime("%d.%m.%Y %H:%M %Z"),
            product=f"DAY_AHEAD_{market.product_minutes}MIN",
            side=side,
            volume_mw=volume,
            energy_mwh=round(economics.grid_energy_mwh, 4),
            limit_price_eur_mwh=price,
            expected_price_eur_mwh=row.price_eur_mwh,
            expected_contribution_eur=contribution,
            sales_revenue_eur=sales,
            purchase_cost_eur=purchases,
            degradation_cost_eur=degradation,
            transaction_fee_eur=fees,
            confidence="medium",
            explanation=("Charge while expected price is comparatively low" if side == "BUY" else "Discharge while expected price is comparatively high"),
        ))
    return orders


def _round_increment(value: float, increment: float):
    return round(round(value / increment) * increment, 6)


def _floor_increment(value: float, increment: float):
    return round(math.floor((value + 1e-9) / increment) * increment, 6)
