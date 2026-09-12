from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from backend.db.repository import save_simulation_with_event
from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import (
    DispatchRow,
    OrderExecutionStatus,
    OrderSimulationRequest,
    OrderSimulationResult,
    OrderSimulationSummary,
    SimulatedOrderResult,
    SubmittedOrder,
    SubmittedOrderType,
    ValidationFinding,
    ValidationResult,
)
from backend.services.forecast_service import build_demo_forecast
from backend.validation.validators import validate_dispatch


def _clears(order: SubmittedOrder, price: float) -> bool:
    if order.order_type == SubmittedOrderType.MARKET:
        return True
    assert order.limit_price_eur_mwh is not None
    return price <= order.limit_price_eur_mwh if order.side == "BUY" else price >= order.limit_price_eur_mwh


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
    )


def _infeasible(order: SubmittedOrder, price: float, soc: float, code: str, reason: str) -> SimulatedOrderResult:
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
    )


def run_order_simulation(request: OrderSimulationRequest) -> OrderSimulationResult:
    points = request.prices or build_demo_forecast(request.delivery_date, request.market)
    if request.price_values is not None:
        points = [point.model_copy(update={"price_eur_mwh": value}) for point, value in zip(points, request.price_values)]

    by_start: dict[datetime, list[SubmittedOrder]] = defaultdict(list)
    for order in request.orders:
        by_start[order.delivery_start_utc.astimezone(timezone.utc)].append(order)

    dt = request.market.product_minutes / 60
    fee = effective_transaction_fee(request.market)
    local_zone = ZoneInfo(request.market.timezone)
    eta = math.sqrt(request.battery.round_trip_efficiency)
    soc = request.battery.initial_soc_mwh
    throughput = cumulative = 0.0
    dispatch: list[DispatchRow] = []
    order_results: list[SimulatedOrderResult] = []
    findings: list[ValidationFinding] = []

    for interval, point in enumerate(points):
        orders = by_start.get(point.timestamp_utc.astimezone(timezone.utc), [])
        soc_before = soc
        sides = {order.side for order in orders}
        eligible: list[SubmittedOrder] = []
        if len(sides) > 1:
            reason = "BUY and SELL orders cannot be simulated in the same delivery interval."
            for order in orders:
                order_results.append(_infeasible(order, point.price_eur_mwh, soc, "CONFLICTING_SIDES", reason))
            findings.append(ValidationFinding(severity="error", code="conflicting_sides", message=reason, interval=interval))
        else:
            for order in orders:
                if _clears(order, point.price_eur_mwh):
                    eligible.append(order)
                else:
                    order_results.append(_not_executed(order, point.price_eur_mwh, soc))

        side = eligible[0].side if eligible else None
        volume = sum(order.volume_mw for order in eligible)
        physical_code = physical_reason = None
        economics = []
        if eligible:
            power_limit = min(
                request.battery.grid_limit_mw,
                request.battery.max_charge_power_mw if side == "BUY" else request.battery.max_discharge_power_mw,
            )
            if interval in request.battery.unavailable_intervals:
                physical_code, physical_reason = "UNAVAILABLE", "The battery is unavailable in this delivery interval."
            elif volume > power_limit + 1e-9:
                physical_code, physical_reason = "POWER_LIMIT", f"Accepted volume is {volume:g} MW; the executable limit is {power_limit:g} MW."
            else:
                economics = [calculate_interval(order.side, order.volume_mw, dt, point.price_eur_mwh, request.battery, fee) for order in eligible]
                delta = sum(item.soc_delta_mwh for item in economics)
                next_soc = soc + delta
                next_throughput = throughput + sum(item.battery_energy_mwh for item in economics)
                if next_soc < request.battery.min_soc_mwh - 1e-9:
                    physical_code, physical_reason = "MINIMUM_SOC", f"Execution would reduce SoC to {next_soc:.2f} MWh, below the {request.battery.min_soc_mwh:g} MWh minimum."
                elif next_soc > request.battery.max_soc_mwh + 1e-9:
                    physical_code, physical_reason = "MAXIMUM_SOC", f"Execution would increase SoC to {next_soc:.2f} MWh, above the {request.battery.max_soc_mwh:g} MWh maximum."
                elif next_throughput > 2 * request.battery.capacity_mwh * request.battery.max_equivalent_cycles + 1e-9:
                    physical_code, physical_reason = "CYCLE_BUDGET", "Execution would exceed the configured daily equivalent-cycle budget."

        if physical_code:
            assert physical_reason is not None
            for order in eligible:
                order_results.append(_infeasible(order, point.price_eur_mwh, soc, physical_code, physical_reason))
            findings.append(ValidationFinding(severity="error", code=physical_code.lower(), message=physical_reason, interval=interval))
            eligible, economics, volume, side = [], [], 0.0, None

        sales = purchases = degradation = transaction = interval_contribution = battery_energy = grid_energy = 0.0
        if eligible:
            soc += sum(item.soc_delta_mwh for item in economics)
            throughput += sum(item.battery_energy_mwh for item in economics)
            for order, item in zip(eligible, economics):
                contribution = round(item.contribution_eur, 2)
                order_results.append(SimulatedOrderResult(
                    submitted_order=order,
                    forecast_price_eur_mwh=point.price_eur_mwh,
                    execution_status=OrderExecutionStatus.EXECUTED,
                    executed_volume_mw=order.volume_mw,
                    execution_price_eur_mwh=point.price_eur_mwh,
                    reason_code="MARKET_ORDER" if order.order_type == SubmittedOrderType.MARKET else "LIMIT_REACHED",
                    reason="Market order executed at the simulated clearing price." if order.order_type == SubmittedOrderType.MARKET else "The simulated clearing price satisfied the order limit.",
                    soc_before_mwh=soc_before,
                    soc_after_mwh=soc,
                    contribution_eur=contribution,
                    sales_revenue_eur=round(item.sales_revenue_eur, 2),
                    purchase_cost_eur=round(item.purchase_cost_eur, 2),
                    degradation_cost_eur=round(item.degradation_cost_eur, 2),
                    transaction_fee_eur=round(item.transaction_fee_eur, 2),
                ))
                sales += item.sales_revenue_eur
                purchases += item.purchase_cost_eur
                degradation += item.degradation_cost_eur
                transaction += item.transaction_fee_eur
                interval_contribution += contribution
                battery_energy += item.battery_energy_mwh
                grid_energy += item.grid_energy_mwh

        cumulative += interval_contribution
        power = -volume if side == "BUY" else volume if side == "SELL" else 0.0
        dispatch.append(DispatchRow(
            interval=interval,
            timestamp_utc=point.timestamp_utc,
            timestamp_local=point.timestamp_utc.astimezone(local_zone).isoformat(),
            price_eur_mwh=point.price_eur_mwh,
            action="charge" if side == "BUY" else "discharge" if side == "SELL" else "idle",
            power_mw=power,
            grid_energy_mwh=round(grid_energy, 6),
            battery_energy_mwh=round(battery_energy, 6),
            soc_mwh=round(soc, 6),
            interval_pnl_eur=round(interval_contribution, 2),
            cumulative_pnl_eur=round(cumulative, 2),
            sales_revenue_eur=round(sales, 2),
            purchase_cost_eur=round(purchases, 2),
            degradation_cost_eur=round(degradation, 2),
            transaction_fee_eur=round(transaction, 2),
        ))

    physical = validate_dispatch(dispatch, request.battery)
    all_findings = findings + physical.findings
    status = "failed" if any(item.severity == "error" for item in all_findings) else "warning" if all_findings else "passed"
    validation = ValidationResult(status=status, findings=all_findings)
    executed = [item for item in order_results if item.execution_status == OrderExecutionStatus.EXECUTED]
    rejected = [item for item in order_results if item.execution_status == OrderExecutionStatus.NOT_EXECUTED]
    infeasible = [item for item in order_results if item.execution_status == OrderExecutionStatus.PHYSICALLY_INFEASIBLE]
    min_soc = min([request.battery.initial_soc_mwh, *[row.soc_mwh for row in dispatch]])
    max_soc = max([request.battery.initial_soc_mwh, *[row.soc_mwh for row in dispatch]])
    created = datetime.now(timezone.utc)
    input_hash = hashlib.sha256(json.dumps(request.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()[:16]
    result = OrderSimulationResult(
        simulation_id=f"ord-{uuid4().hex[:10]}",
        created_at_utc=created,
        delivery_date=request.delivery_date,
        battery=request.battery,
        market=request.market,
        forecast=request.forecast.model_copy(update={"created_at_utc": request.forecast.created_at_utc or created}),
        forecast_points=points,
        submitted_orders=request.orders,
        order_results=sorted(order_results, key=lambda item: (item.submitted_order.delivery_start_utc, item.submitted_order.client_order_id)),
        dispatch=dispatch,
        validation=validation,
        summary=OrderSimulationSummary(
            submitted_order_count=len(request.orders), executed_order_count=len(executed),
            not_executed_order_count=len(rejected), infeasible_order_count=len(infeasible),
            initial_soc_mwh=request.battery.initial_soc_mwh, final_soc_mwh=round(soc, 3),
            min_soc_mwh=round(min_soc, 3), max_soc_mwh=round(max_soc, 3),
            charged_grid_mwh=round(sum(row.grid_energy_mwh for row in dispatch if row.action == "charge"), 3),
            discharged_grid_mwh=round(sum(row.grid_energy_mwh for row in dispatch if row.action == "discharge"), 3),
            throughput_mwh=round(throughput, 3), equivalent_cycles=round(throughput / (2 * request.battery.capacity_mwh), 3),
            sales_revenue_eur=round(sum(item.sales_revenue_eur for item in executed), 2),
            purchase_cost_eur=round(sum(item.purchase_cost_eur for item in executed), 2),
            degradation_cost_eur=round(sum(item.degradation_cost_eur for item in executed), 2),
            transaction_fee_eur=round(sum(item.transaction_fee_eur for item in executed), 2),
            net_contribution_eur=round(sum(item.contribution_eur for item in executed), 2),
        ),
        audit={
            "schema_version": 6, "input_hash": input_hash,
            "simulation_engine": "deterministic_order_clearing_v1",
            "validation_version": "physical_and_order_validation_v4",
            "clearing_assumption": "Forecast price is used as simulated auction clearing and settlement price; full execution only.",
        },
    )
    payload = result.model_dump(mode="json")
    save_simulation_with_event(payload, created.isoformat(), "ORDER_SIMULATION_CREATED", {"run_type": result.run_type, "validation_status": validation.status})
    return result
