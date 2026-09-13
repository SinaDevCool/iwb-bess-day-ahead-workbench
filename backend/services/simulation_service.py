from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from backend.db.repository import save_simulation_with_event
from backend.domain.models import SimulationRequest, SimulationResult
from backend.services.decision_support_service import (
    build_executable_orders,
    resolve_terminal_value,
    select_risk_aware_dispatch,
)
from backend.services.forecast_import_service import forecast_hash
from backend.services.forecast_service import apply_scenario
from backend.services.run_identity_service import default_run_display_name
from backend.services.sensitivity_service import (
    calculate_sensitivities,
)
from backend.services.sensitivity_service import (
    sensitivities_for_snapshot as sensitivities_for_snapshot,
)
from backend.validation.validators import validate_dispatch


from backend.services.forecast_resolution import resolve_forecast
from backend.services.optimization_summary import build_optimization_summary


def run_simulation(request: SimulationRequest) -> SimulationResult:
    """Optimize, validate and persist one proposal with its immutable input evidence."""
    base_prices = resolve_forecast(request)
    prices = apply_scenario(
        base_prices,
        multiplier=request.price_multiplier,
        peak_reduction=request.peak_reduction_eur_mwh,
        conservative=request.scenario_name.casefold() == "downside"
        or request.strategy == "conservative",
    )
    terminal_value = resolve_terminal_value(request)
    dispatch, optimization, risk, stable_intervals = select_risk_aware_dispatch(
        request, base_prices, prices, terminal_value
    )
    simulation_id = f"sim-{uuid4().hex[:10]}"
    orders, order_validation, proposal, order_generation = build_executable_orders(
        simulation_id, dispatch, request.market, request.battery
    )
    dispatch_validation = validate_dispatch(dispatch, request.battery, request.market)
    findings = dispatch_validation.findings + order_validation.findings
    validation_status = (
        "failed"
        if any(x.severity == "error" for x in findings)
        else "warning"
        if findings
        else "passed"
    )
    validation = dispatch_validation.model_copy(
        update={"status": validation_status, "findings": findings}
    )
    summary = build_optimization_summary(
        request, dispatch, proposal, orders, order_generation, terminal_value
    )
    contribution = sum(row.interval_pnl_eur for row in dispatch)
    incremental_energy = max(
        proposal["proposal_terminal_soc_mwh"] - request.battery.target_soc_mwh, 0
    )
    terminal_energy_value = summary["terminal_energy_value_eur"]
    for order in orders:
        if order.delivery_start_utc in stable_intervals:
            order.confidence = "high"
            order.explanation += "; direction is stable across downside, expected and upside cases"
    created_at = datetime.now(timezone.utc)
    forecast_metadata = request.forecast.model_copy(
        update={
            "created_at_utc": request.forecast.created_at_utc or created_at,
            "content_hash": forecast_hash(base_prices),
        }
    )
    input_hash = hashlib.sha256(
        json.dumps(
            request.model_dump(mode="json", exclude={"include_sensitivities"}), sort_keys=True
        ).encode()
    ).hexdigest()[:16]
    sensitivities = (
        calculate_sensitivities(
            request, base_prices, prices, dispatch, round(contribution, 2), terminal_value
        )
        if request.include_sensitivities
        else []
    )
    result = SimulationResult(
        simulation_id=simulation_id,
        display_name=default_run_display_name(request),
        created_at_utc=created_at,
        delivery_date=request.delivery_date,
        scenario_name=request.scenario_name,
        strategy=request.strategy,
        risk_posture=request.risk_posture,
        horizon_policy=request.horizon_policy,
        terminal_value_eur_per_mwh=request.terminal_value_eur_per_mwh,
        price_multiplier=request.price_multiplier,
        peak_reduction_eur_mwh=request.peak_reduction_eur_mwh,
        scenario_probabilities=request.scenario_probabilities,
        lookahead_hours=request.lookahead_hours,
        battery=request.battery,
        market=request.market,
        dispatch=dispatch,
        orders=orders,
        validation=validation,
        summary=summary,
        optimization=optimization,
        proposal=proposal,
        audit={
            "schema_version": 5,
            "input_hash": input_hash,
            "forecast_version": request.forecast.version,
            "optimizer_version": optimization["engine"],
            "validation_version": "physical_and_order_validation_v4",
            "modified_by_trader": False,
            "assumption_sources": {
                "battery.capacity_mwh": "IWB task baseline",
                "battery.power_limits": "IWB task baseline / user input",
                "market.product_minutes": "Market configuration assumption",
                "market.exchange_fee": "IWB contract value"
                if request.market.exchange_fee_policy == "configured"
                else "Excluded; IWB confirmation required",
                "market.clearing_fee": "ECC public tariff assumption",
                "forecast": f"{request.forecast.source_type}: {request.forecast.source_name}",
            },
        },
        order_generation=order_generation,
        risk=risk,
        horizon={
            "policy": request.horizon_policy,
            "terminal_value_eur_per_mwh": terminal_value,
            "reserve_soc_mwh": request.battery.target_soc_mwh,
            "terminal_soc_mwh": proposal["proposal_terminal_soc_mwh"],
            "incremental_stored_energy_mwh": round(incremental_energy, 3),
            "terminal_energy_value_eur": terminal_energy_value,
            "lookahead_hours": request.lookahead_hours
            if request.horizon_policy in {"next_day_proxy", "multi_day"}
            else 0,
            "continuation_forecast_version": request.forecast.version
            if request.horizon_policy in {"next_day_proxy", "multi_day"}
            else None,
        },
        forecast=forecast_metadata,
        forecast_points=base_prices,
        sensitivities=sensitivities,
    )
    payload = result.model_dump(mode="json")
    save_simulation_with_event(
        payload,
        created_at.isoformat(),
        "SIMULATION_CREATED",
        {
            "schema_version": 5,
            "input_hash": input_hash,
            "validation": validation_status,
            "optimizer": optimization["engine"],
        },
    )
    return result
