from __future__ import annotations

from datetime import timedelta
import math
from zoneinfo import ZoneInfo

from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import BatteryConfig, DispatchRow, MarketConfig, Order


def build_orders(simulation_id: str, rows: list[DispatchRow], market: MarketConfig, battery: BatteryConfig):
    orders = []
    transaction_fee = effective_transaction_fee(market)
    zone = ZoneInfo(market.timezone)
    prices = [row.price_eur_mwh for row in rows]
    eta2 = battery.round_trip_efficiency
    eta = math.sqrt(eta2)
    for row in rows:
        if row.action == "idle" or abs(row.power_mw) < 1e-8:
            continue
        side = "BUY" if row.action == "charge" else "SELL"
        # Never round a continuous dispatch upward into an order the physical
        # schedule did not reserve capacity for.
        volume = _floor_increment(abs(row.power_mw), market.volume_increment_mw)
        if volume <= 0:
            continue
        fee = transaction_fee
        if side == "BUY":
            future_peak = max(prices[row.interval + 1:] or [row.price_eur_mwh])
            # One grid MWh bought produces eta² grid MWh for a later sale.
            # Wear is charged to battery-side energy on both legs: 2η × cost.
            break_even = future_peak * eta2 - fee * (1 + eta2) - 2 * battery.degradation_cost_eur_per_mwh * eta
            margin = break_even - row.price_eur_mwh
        else:
            prior_low = min(prices[:row.interval] or [row.price_eur_mwh])
            # Replacement cost of one grid MWh sold: 1/eta² MWh must be
            # repurchased, and the two battery-side legs total 2/eta MWh.
            break_even = (prior_low + fee) / eta2 + fee + 2 * battery.degradation_cost_eur_per_mwh / eta
            margin = row.price_eur_mwh - break_even
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
            break_even_price_eur_mwh=round(break_even, 2),
            margin_to_break_even_eur_mwh=round(margin, 2),
            pricing_posture="balanced",
            expected_contribution_eur=contribution,
            sales_revenue_eur=sales,
            purchase_cost_eur=purchases,
            degradation_cost_eur=degradation,
            transaction_fee_eur=fees,
            confidence="medium",
            explanation=("Charge below the efficiency- and cost-adjusted future sale value" if side == "BUY" else "Discharge above the efficiency- and cost-adjusted replacement cost"),
        ))
    return orders


def _round_increment(value: float, increment: float):
    return round(round(value / increment) * increment, 6)


def _floor_increment(value: float, increment: float):
    return round(math.floor((value + 1e-9) / increment) * increment, 6)
