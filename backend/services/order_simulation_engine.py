"""Deterministic full-fill simulation. No database writes, random IDs or clock reads.

Each interval is evaluated as one batch; SoC is carried to the next interval.
A rejected batch is never silently clipped or converted into a partial fill.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime

from backend.domain.models import (
    OrderExecutionStatus,
    OrderSimulationRequest,
    OrderSimulationResult,
    OrderSimulationSummary,
    ValidationResult,
)
from backend.services.forecast_import_service import forecast_hash
from backend.validation.validators import validate_dispatch


from backend.services.forecast_resolution import resolve_forecast
from backend.services.order_schedule import evaluate_schedule
from backend.domain.schemas.simulation_assumptions import SimulationAssumptions
from backend.services.order_outcome_evidence import attach_interval_evidence


def calculate_order_simulation(
    request: OrderSimulationRequest, *, created: datetime, simulation_id: str
) -> OrderSimulationResult:
    """Evaluate and report a complete day; IDs and time are supplied by the service."""
    points = resolve_forecast(request)

    by_start, dispatch, order_results, findings, soc, throughput = evaluate_schedule(
        request, points
    )

    attach_interval_evidence(request, points, by_start, dispatch, order_results)
    physical = validate_dispatch(dispatch, request.battery, request.market)
    all_findings = findings + physical.findings
    status = (
        "failed"
        if any(item.severity == "error" for item in all_findings)
        else "warning"
        if all_findings
        else "passed"
    )
    validation = ValidationResult(status=status, findings=all_findings)
    executed = [
        item for item in order_results if item.execution_status == OrderExecutionStatus.EXECUTED
    ]
    rejected = [
        item for item in order_results if item.execution_status == OrderExecutionStatus.NOT_EXECUTED
    ]
    infeasible = [
        item
        for item in order_results
        if item.execution_status == OrderExecutionStatus.PHYSICALLY_INFEASIBLE
    ]
    min_soc = min([request.battery.initial_soc_mwh, *[row.soc_mwh for row in dispatch]])
    max_soc = max([request.battery.initial_soc_mwh, *[row.soc_mwh for row in dispatch]])
    input_hash = hashlib.sha256(
        json.dumps(request.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()[:16]
    result = OrderSimulationResult(
        simulation_id=simulation_id,
        created_at_utc=created,
        delivery_date=request.delivery_date,
        battery=request.battery,
        market=request.market,
        forecast=request.forecast.model_copy(
            update={
                "created_at_utc": request.forecast.created_at_utc or created,
                "content_hash": forecast_hash(points),
            }
        ),
        forecast_points=points,
        submitted_orders=request.orders,
        order_results=sorted(
            order_results,
            key=lambda item: (
                item.submitted_order.delivery_start_utc,
                item.submitted_order.client_order_id,
            ),
        ),
        dispatch=dispatch,
        validation=validation,
        summary=OrderSimulationSummary(
            submitted_order_count=len(request.orders),
            executed_order_count=len(executed),
            not_executed_order_count=len(rejected),
            infeasible_order_count=len(infeasible),
            initial_soc_mwh=request.battery.initial_soc_mwh,
            final_soc_mwh=round(soc, 3),
            min_soc_mwh=round(min_soc, 3),
            max_soc_mwh=round(max_soc, 3),
            charged_grid_mwh=round(
                sum(row.grid_energy_mwh for row in dispatch if row.action == "charge"), 3
            ),
            discharged_grid_mwh=round(
                sum(row.grid_energy_mwh for row in dispatch if row.action == "discharge"), 3
            ),
            throughput_mwh=round(throughput, 3),
            equivalent_cycles=round(throughput / (2 * request.battery.capacity_mwh), 3),
            sales_revenue_eur=round(sum(item.sales_revenue_eur for item in executed), 2),
            purchase_cost_eur=round(sum(item.purchase_cost_eur for item in executed), 2),
            degradation_cost_eur=round(sum(item.degradation_cost_eur for item in executed), 2),
            transaction_fee_eur=round(sum(item.transaction_fee_eur for item in executed), 2),
            net_contribution_eur=round(sum(item.contribution_eur for item in executed), 2),
        ),
        audit={
            "schema_version": 7,
            "input_hash": input_hash,
            "source_proposal_id": request.source_proposal_id,
            "simulation_engine": "deterministic_order_clearing_v2",
            "validation_version": "physical_and_order_validation_v4",
            "clearing_assumption": "Forecast price is used as simulated auction clearing and settlement price; full execution only.",
        },
        submitted_portfolio_feasible=not bool(infeasible) and physical.status != "failed",
        executed_schedule_feasible=physical.status != "failed",
        assumptions=SimulationAssumptions(),
    )
    return result
