"""Deterministic full-fill simulation. No database writes, random IDs or clock reads.

Each interval is evaluated as one batch; SoC is carried to the next interval.
A rejected batch is never silently clipped or converted into a partial fill.
"""

from __future__ import annotations

from collections import defaultdict
from typing import NamedTuple
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from backend.domain.models import (
    DispatchRow,
    OrderSimulationRequest,
    SimulatedOrderResult,
    SubmittedOrder,
    ValidationFinding,
)
from backend.services.order_execution_rules import (
    _clears,
    _infeasible,
    _not_executed,
    evaluate_batch,
    executed_outcome,
)


class BatchSettlement(NamedTuple):
    """Internal ledger result. Financial amounts are sums of cent-rounded orders."""

    soc: float
    throughput: float
    sales: float
    purchases: float
    degradation: float
    transaction: float
    interval_contribution: float
    battery_energy: float
    grid_energy: float


def eligible_orders(orders, point, soc, interval, order_results, findings):
    """Append non-clearing/conflicting outcomes; return only price-eligible orders."""
    eligible: list[SubmittedOrder] = []
    # Conditional opposite-side bids are valid inputs. Only bids that qualify
    # at this forecast can conflict physically; never net or prioritize them.
    for order in orders:
        if _clears(order, point.price_eur_mwh):
            eligible.append(order)
        else:
            order_results.append(_not_executed(order, point.price_eur_mwh, soc))
    sides = {order.side for order in eligible}
    if len(sides) > 1:
        reason = "Both BUY and SELL orders meet their price conditions in this interval; simultaneous physical execution is not supported. Adjust their limits or volumes."
        for order in eligible:
            order_results.append(
                _infeasible(order, point.price_eur_mwh, soc, "CONFLICTING_SIDES", reason)
            )
        findings.append(
            ValidationFinding(
                severity="error", code="conflicting_sides", message=reason, interval=interval
            )
        )
        return []

    return eligible


def settle_batch(
    eligible, economics, point, soc_before, soc, throughput, dt, order_results
) -> BatchSettlement:
    """Round each order to cents before summing so outcomes and daily cash reconcile."""
    sales = purchases = degradation = transaction = interval_contribution = battery_energy = (
        grid_energy
    ) = 0.0
    if eligible:
        soc += sum(item.soc_delta_mwh for item in economics)
        throughput += sum(item.battery_energy_mwh for item in economics)
        for order, item in zip(eligible, economics):
            contribution = round(
                round(item.sales_revenue_eur, 2)
                - round(item.purchase_cost_eur, 2)
                - round(item.degradation_cost_eur, 2)
                - round(item.transaction_fee_eur, 2),
                2,
            )
            order_results.append(
                executed_outcome(
                    order, item, point.price_eur_mwh, soc_before, soc, dt, contribution
                )
            )
            sales += round(item.sales_revenue_eur, 2)
            purchases += round(item.purchase_cost_eur, 2)
            degradation += round(item.degradation_cost_eur, 2)
            transaction += round(item.transaction_fee_eur, 2)
            interval_contribution += contribution
            battery_energy += item.battery_energy_mwh
            grid_energy += item.grid_energy_mwh

    return BatchSettlement(
        soc,
        throughput,
        sales,
        purchases,
        degradation,
        transaction,
        interval_contribution,
        battery_energy,
        grid_energy,
    )


def evaluate_schedule(request: OrderSimulationRequest, points):
    """Carry SoC and throughput forward once per interval; no silent partial execution."""
    by_start: dict[datetime, list[SubmittedOrder]] = defaultdict(list)
    for order in request.orders:
        by_start[order.delivery_start_utc.astimezone(timezone.utc)].append(order)

    dt = request.market.product_minutes / 60
    local_zone = ZoneInfo(request.market.timezone)
    soc = request.battery.initial_soc_mwh
    throughput = cumulative = 0.0
    dispatch: list[DispatchRow] = []
    order_results: list[SimulatedOrderResult] = []
    findings: list[ValidationFinding] = []

    for interval, point in enumerate(points):
        orders = by_start.get(point.timestamp_utc.astimezone(timezone.utc), [])
        soc_before = soc
        eligible = eligible_orders(orders, point, soc, interval, order_results, findings)
        side = eligible[0].side if eligible else None
        volume = sum(order.volume_mw for order in eligible)
        evidence = {}
        physical_code, physical_reason, economics = evaluate_batch(
            request, eligible, interval, point, soc, throughput, evidence
        )

        if physical_code:
            assert physical_reason is not None
            for order in eligible:
                order_results.append(
                    _infeasible(order, point.price_eur_mwh, soc, physical_code, physical_reason)
                )
            findings.append(
                ValidationFinding(
                    severity="error",
                    code=physical_code.lower(),
                    message=physical_reason,
                    interval=interval,
                    **evidence,
                )
            )
            eligible, economics, volume, side = [], [], 0.0, None

        (
            soc,
            throughput,
            sales,
            purchases,
            degradation,
            transaction,
            interval_contribution,
            battery_energy,
            grid_energy,
        ) = settle_batch(eligible, economics, point, soc_before, soc, throughput, dt, order_results)

        cumulative += interval_contribution
        power = -volume if side == "BUY" else volume if side == "SELL" else 0.0
        dispatch.append(
            DispatchRow(
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
            )
        )

    return by_start, dispatch, order_results, findings, soc, throughput
