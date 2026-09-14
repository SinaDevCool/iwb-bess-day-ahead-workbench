"""Evaluate price eligibility and same-side batch limits without mutating the schedule.

order_schedule owns chronology; these rules never clip an infeasible batch.
"""

from __future__ import annotations

from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import (
    OrderExecutionStatus,
    SimulatedOrderResult,
    SubmittedOrder,
    SubmittedOrderType,
)


def _clears(order: SubmittedOrder, price: float) -> bool:
    if order.order_type == SubmittedOrderType.MARKET:
        return True
    assert order.limit_price_eur_mwh is not None
    return (
        price <= order.limit_price_eur_mwh
        if order.side == "BUY"
        else price >= order.limit_price_eur_mwh
    )


def _not_executed(order: SubmittedOrder, price: float, soc: float) -> SimulatedOrderResult:
    comparison = "at or below" if order.side == "BUY" else "at or above"
    return SimulatedOrderResult(
        submitted_order=order,
        forecast_price_eur_mwh=price,
        execution_status=OrderExecutionStatus.NOT_EXECUTED,
        executed_volume_mw=0,
        reason_code="LIMIT_NOT_REACHED",
        reason=f"Forecast price must be {comparison} the {order.limit_price_eur_mwh:g} EUR/MWh limit.",
        soc_before_mwh=soc,
        soc_after_mwh=soc,
        contribution_eur=0,
        price_condition_operator="<=" if order.side == "BUY" else ">=",
        price_condition_passed=False,
        price_margin_eur_mwh=(order.limit_price_eur_mwh - price)
        if order.side == "BUY"
        else (price - order.limit_price_eur_mwh),
    )


def _infeasible(
    order: SubmittedOrder, price: float, soc: float, code: str, reason: str
) -> SimulatedOrderResult:
    return SimulatedOrderResult(
        submitted_order=order,
        forecast_price_eur_mwh=price,
        execution_status=OrderExecutionStatus.PHYSICALLY_INFEASIBLE,
        executed_volume_mw=0,
        reason_code=code,
        reason=reason,
        soc_before_mwh=soc,
        soc_after_mwh=soc,
        contribution_eur=0,
        price_condition_operator=None
        if order.order_type == SubmittedOrderType.MARKET
        else ("<=" if order.side == "BUY" else ">="),
        price_condition_passed=_clears(order, price),
        price_margin_eur_mwh=None
        if order.limit_price_eur_mwh is None
        else (
            order.limit_price_eur_mwh - price
            if order.side == "BUY"
            else price - order.limit_price_eur_mwh
        ),
    )


def independent_batch_issues(request, eligible, interval):
    """Same-side checks independent of the SoC trajectory; shared by repair and execution."""
    if not eligible:
        return []
    side = eligible[0].side
    limit = min(
        request.battery.grid_limit_mw,
        request.battery.max_charge_power_mw
        if side == "BUY"
        else request.battery.max_discharge_power_mw,
    )
    volume = sum(o.volume_mw for o in eligible)
    issues = []
    if interval in request.battery.unavailable_intervals:
        issues.append(("UNAVAILABLE", "The battery is unavailable in this delivery interval.", {}))
    if volume > limit + 1e-9:
        issues.append(
            (
                "POWER_LIMIT",
                f"Accepted volume is {volume:g} MW; the executable limit is {limit:g} MW.",
                {"observed_value": volume, "configured_limit": limit, "unit": "MW"},
            )
        )
    return issues


def evaluate_batch(request, eligible, interval, point, soc, throughput, evidence=None):
    """Evaluate all accepted same-side orders together; never clip physical volume."""
    dt = request.market.product_minutes / 60
    fee = effective_transaction_fee(request.market)
    physical_code = physical_reason = None
    economics = []
    if eligible:
        independent = independent_batch_issues(request, eligible, interval)
        if independent:
            physical_code, physical_reason, independent_evidence = independent[0]
            if evidence is not None:
                evidence.update(independent_evidence)
        else:
            economics = [
                calculate_interval(
                    order.side, order.volume_mw, dt, point.price_eur_mwh, request.battery, fee
                )
                for order in eligible
            ]
            delta = sum(item.soc_delta_mwh for item in economics)
            next_soc = soc + delta
            next_throughput = throughput + sum(item.battery_energy_mwh for item in economics)
            if next_soc < request.battery.min_soc_mwh - 1e-9:
                physical_code, physical_reason = (
                    "MINIMUM_SOC",
                    f"Execution would reduce SoC to {next_soc:.2f} MWh, below the {request.battery.min_soc_mwh:g} MWh minimum.",
                )
            elif next_soc > request.battery.max_soc_mwh + 1e-9:
                physical_code, physical_reason = (
                    "MAXIMUM_SOC",
                    f"Execution would increase SoC to {next_soc:.2f} MWh, above the {request.battery.max_soc_mwh:g} MWh maximum.",
                )
            elif (
                next_throughput
                > 2 * request.battery.capacity_mwh * request.battery.max_equivalent_cycles + 1e-9
            ):
                physical_code, physical_reason = (
                    "CYCLE_BUDGET",
                    "Execution would exceed the configured daily equivalent-cycle budget.",
                )

    # Capture values where they are calculated; consumers never parse warning text.
    if evidence is not None and physical_code:
        values = {}
        if economics:
            values.update(
                {
                    "MINIMUM_SOC": (next_soc, request.battery.min_soc_mwh, "MWh"),
                    "MAXIMUM_SOC": (next_soc, request.battery.max_soc_mwh, "MWh"),
                    "CYCLE_BUDGET": (
                        next_throughput,
                        2 * request.battery.capacity_mwh * request.battery.max_equivalent_cycles,
                        "MWh",
                    ),
                }
            )
        if physical_code in values:
            observed, limit, unit = values[physical_code]
            evidence.update(observed_value=observed, configured_limit=limit, unit=unit)
    return physical_code, physical_reason, economics


def executed_outcome(order, item, price, soc_before, soc, dt, contribution):
    """Report a single order with shared batch SoC and reconciled money components."""
    return SimulatedOrderResult(
        submitted_order=order,
        forecast_price_eur_mwh=price,
        execution_status=OrderExecutionStatus.EXECUTED,
        executed_volume_mw=order.volume_mw,
        execution_price_eur_mwh=price,
        reason_code="MARKET_ORDER"
        if order.order_type == SubmittedOrderType.MARKET
        else "LIMIT_REACHED",
        reason="Market order executed at the simulated clearing price."
        if order.order_type == SubmittedOrderType.MARKET
        else "The simulated clearing price satisfied the order limit.",
        soc_before_mwh=soc_before,
        soc_after_mwh=soc,
        contribution_eur=contribution,
        sales_revenue_eur=round(item.sales_revenue_eur, 2),
        purchase_cost_eur=round(item.purchase_cost_eur, 2),
        degradation_cost_eur=round(item.degradation_cost_eur, 2),
        transaction_fee_eur=round(item.transaction_fee_eur, 2),
        price_condition_operator=None
        if order.order_type == SubmittedOrderType.MARKET
        else ("<=" if order.side == "BUY" else ">="),
        price_condition_passed=True,
        price_margin_eur_mwh=None
        if order.order_type == SubmittedOrderType.MARKET
        else (
            (order.limit_price_eur_mwh - price)
            if order.side == "BUY"
            else (price - order.limit_price_eur_mwh)
        ),
        executed_energy_mwh=round(order.volume_mw * dt, 6),
        soc_delta_mwh=round(item.soc_delta_mwh, 6),
    )
