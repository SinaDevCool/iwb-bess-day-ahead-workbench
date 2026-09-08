from __future__ import annotations

from collections import Counter
from datetime import timedelta
from decimal import Decimal
import math

from backend.domain.models import BatteryConfig, DispatchRow, MarketConfig, Order, ValidationFinding, ValidationResult


def validate_dispatch(rows: list[DispatchRow], battery: BatteryConfig) -> ValidationResult:
    findings = []
    for row in rows:
        if row.soc_mwh < battery.min_soc_mwh - 1e-3:
            findings.append(ValidationFinding(severity="error", code="soc_below_min", message="SOC is below the configured minimum", interval=row.interval))
        if row.soc_mwh > battery.max_soc_mwh + 1e-3:
            findings.append(ValidationFinding(severity="error", code="soc_above_max", message="SOC is above the configured maximum", interval=row.interval))
        if abs(row.power_mw) > battery.grid_limit_mw + 1e-3:
            findings.append(ValidationFinding(severity="error", code="grid_limit", message="Grid power limit exceeded", interval=row.interval))
        if row.interval in battery.unavailable_intervals and row.action != "idle":
            findings.append(ValidationFinding(severity="error", code="unavailable", message="Dispatch scheduled during unavailability", interval=row.interval))
    if rows and rows[-1].soc_mwh < battery.target_soc_mwh - 1e-3:
        findings.append(ValidationFinding(severity="error", code="terminal_soc", message="Terminal SOC target not met"))
    if not rows:
        findings.append(ValidationFinding(severity="error", code="empty_schedule", message="No dispatch intervals generated"))
    return _result(findings)


def validate_orders(orders: list[Order], market: MarketConfig) -> ValidationResult:
    findings = []
    ids = Counter(order.order_id for order in orders)
    for order in orders:
        if ids[order.order_id] > 1:
            findings.append(ValidationFinding(severity="error", code="duplicate_order", message=f"Duplicate order {order.order_id}"))
        if not market.min_price_eur_mwh <= order.limit_price_eur_mwh <= market.max_price_eur_mwh:
            findings.append(ValidationFinding(severity="error", code="price_range", message=f"Order {order.order_id} price is outside configured bounds"))
        duration = order.delivery_end_utc - order.delivery_start_utc
        if duration != timedelta(minutes=market.product_minutes):
            findings.append(ValidationFinding(severity="error", code="duration", message=f"Order {order.order_id} has the wrong product duration"))
    return _result(findings)


def validate_order_proposal(orders: list[Order], market: MarketConfig, battery: BatteryConfig, dispatch: list[DispatchRow]):
    """Validate an edited order package and reconstruct its implied physical schedule."""
    findings = list(validate_orders(orders, market).findings)
    dt = market.product_minutes / 60
    eta = math.sqrt(battery.round_trip_efficiency)
    max_charge = min(battery.max_charge_power_mw, battery.grid_limit_mw)
    max_discharge = min(battery.max_discharge_power_mw, battery.grid_limit_mw)
    interval_by_start = {row.timestamp_utc: row for row in dispatch}
    order_by_start: dict = {}
    for order in orders:
        if order.delivery_start_utc not in interval_by_start:
            findings.append(ValidationFinding(severity="error", code="unknown_interval", message=f"Order {order.order_id} does not match a delivery interval"))
            continue
        if order.delivery_start_utc in order_by_start:
            findings.append(ValidationFinding(severity="error", code="multiple_orders_interval", message=f"Multiple orders exist for {order.delivery_local}"))
        order_by_start[order.delivery_start_utc] = order
        limit = max_charge if order.side == "BUY" else max_discharge
        if order.volume_mw > limit + 1e-6:
            findings.append(ValidationFinding(severity="error", code="order_power_limit", message=f"Order {order.order_id} requests {order.volume_mw:g} MW; limit is {limit:g} MW"))
        expected_energy = order.volume_mw * dt
        if abs(order.energy_mwh - expected_energy) > 1e-4:
            findings.append(ValidationFinding(severity="error", code="energy_mismatch", message=f"Order {order.order_id} MWh does not match MW × duration"))
        if not _is_increment(order.volume_mw, market.volume_increment_mw):
            findings.append(ValidationFinding(severity="error", code="volume_increment", message=f"Order {order.order_id} volume violates the {market.volume_increment_mw:g} MW increment"))
        if not _is_increment(order.limit_price_eur_mwh, market.price_increment_eur_mwh):
            findings.append(ValidationFinding(severity="error", code="price_increment", message=f"Order {order.order_id} price violates the {market.price_increment_eur_mwh:g} increment"))

    soc = battery.initial_soc_mwh
    throughput = 0.0
    contribution = 0.0
    sales_revenue = 0.0
    purchase_cost = 0.0
    degradation_cost = 0.0
    implied_soc = []
    below_reported = False
    above_reported = False
    unavailable = set(battery.unavailable_intervals)
    for row in dispatch:
        order = order_by_start.get(row.timestamp_utc)
        if order:
            if row.interval in unavailable:
                findings.append(ValidationFinding(severity="error", code="order_unavailable", message=f"Order {order.order_id} is in an unavailable interval", interval=row.interval))
            if order.side == "BUY":
                battery_energy = order.energy_mwh * eta
                soc += battery_energy
                energy_value = order.energy_mwh * order.expected_price_eur_mwh
                wear = battery_energy * battery.degradation_cost_eur_per_mwh
                order.sales_revenue_eur = 0
                order.purchase_cost_eur = round(energy_value, 2)
                order.degradation_cost_eur = round(wear, 2)
            else:
                battery_energy = order.energy_mwh / eta
                soc -= battery_energy
                energy_value = order.energy_mwh * order.expected_price_eur_mwh
                wear = battery_energy * battery.degradation_cost_eur_per_mwh
                order.sales_revenue_eur = round(energy_value, 2)
                order.purchase_cost_eur = 0
                order.degradation_cost_eur = round(wear, 2)
            order.expected_contribution_eur = round(order.sales_revenue_eur - order.purchase_cost_eur - order.degradation_cost_eur, 2)
            sales_revenue += order.sales_revenue_eur
            purchase_cost -= order.purchase_cost_eur
            degradation_cost += order.degradation_cost_eur
            contribution += order.expected_contribution_eur
            throughput += battery_energy
        implied_soc.append(round(soc, 6))
        if soc < battery.min_soc_mwh - 0.15 and not below_reported:
            findings.append(ValidationFinding(severity="error", code="proposal_soc_below_min", message=f"Edited orders drive SoC below minimum at interval {row.interval}", interval=row.interval))
            below_reported = True
        if soc > battery.max_soc_mwh + 0.15 and not above_reported:
            findings.append(ValidationFinding(severity="error", code="proposal_soc_above_max", message=f"Edited orders drive SoC above maximum at interval {row.interval}", interval=row.interval))
            above_reported = True
    if soc < battery.target_soc_mwh - 0.15:
        findings.append(ValidationFinding(severity="error", code="proposal_terminal_soc", message=f"Edited orders finish at {soc:.2f} MWh, below the {battery.target_soc_mwh:g} MWh target"))
    maximum_throughput = 2 * battery.capacity_mwh * battery.max_equivalent_cycles
    if throughput > maximum_throughput + 0.15:
        findings.append(ValidationFinding(severity="error", code="proposal_cycle_limit", message="Edited orders exceed the configured equivalent-cycle budget"))
    return _result(findings), {
        "proposal_contribution_eur": round(contribution, 2),
        "proposal_terminal_soc_mwh": round(soc, 3),
        "proposal_throughput_mwh": round(throughput, 3),
        "proposal_equivalent_cycles": round(throughput / (2 * battery.capacity_mwh), 3),
        "proposal_min_soc_mwh": round(min(implied_soc, default=battery.initial_soc_mwh), 3),
        "proposal_max_soc_mwh": round(max(implied_soc, default=battery.initial_soc_mwh), 3),
        "proposal_sales_revenue_eur": round(sales_revenue, 2),
        "proposal_purchase_cost_eur": round(purchase_cost, 2),
        "proposal_degradation_cost_eur": round(degradation_cost, 2),
        "proposal_buy_volume_mwh": round(sum(order.energy_mwh for order in orders if order.side == "BUY"), 3),
        "proposal_sell_volume_mwh": round(sum(order.energy_mwh for order in orders if order.side == "SELL"), 3),
        "implied_soc_mwh": implied_soc,
    }


def _is_increment(value: float, increment: float) -> bool:
    quotient = Decimal(str(value)) / Decimal(str(increment))
    return abs(quotient - quotient.to_integral_value()) <= Decimal("0.000001")


def _result(findings):
    if any(item.severity == "error" for item in findings):
        status = "failed"
    elif findings:
        status = "warning"
    else:
        status = "passed"
    return ValidationResult(status=status, findings=findings)
