from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from backend.db.repository import save_simulation_with_event
from backend.domain.models import SimulationRequest, SimulationResult
from backend.services.forecast_service import apply_scenario, build_demo_forecast
from backend.services.decision_support_service import build_executable_orders, resolve_terminal_value, select_risk_aware_dispatch
from backend.optimization.milp_optimizer import optimize_dispatch
from backend.validation.validators import validate_dispatch


def run_simulation(request: SimulationRequest) -> SimulationResult:
    base_prices = request.prices or build_demo_forecast(request.delivery_date, request.market)
    if request.price_values is not None:
        base_prices = [point.model_copy(update={"price_eur_mwh": value}) for point, value in zip(base_prices, request.price_values)]
    prices = apply_scenario(
        base_prices,
        multiplier=request.price_multiplier,
        peak_reduction=request.peak_reduction_eur_mwh,
        conservative=request.scenario_name.casefold() == "downside" or request.strategy == "conservative",
    )
    terminal_value = resolve_terminal_value(request)
    dispatch, optimization, risk, stable_intervals = select_risk_aware_dispatch(request, base_prices, prices, terminal_value)
    simulation_id = f"sim-{uuid4().hex[:10]}"
    orders, order_validation, proposal, order_generation = build_executable_orders(simulation_id, dispatch, request.market, request.battery)
    dispatch_validation = validate_dispatch(dispatch, request.battery)
    findings = dispatch_validation.findings + order_validation.findings
    validation_status = "failed" if any(x.severity == "error" for x in findings) else "warning" if findings else "passed"
    validation = dispatch_validation.model_copy(update={"status": validation_status, "findings": findings})
    charge_grid = sum(row.grid_energy_mwh for row in dispatch if row.action == "charge")
    discharge_grid = sum(row.grid_energy_mwh for row in dispatch if row.action == "discharge")
    charge_cost = -sum(row.grid_energy_mwh * row.price_eur_mwh for row in dispatch if row.action == "charge")
    sales_revenue = sum(row.grid_energy_mwh * row.price_eur_mwh for row in dispatch if row.action == "discharge")
    throughput = sum(row.battery_energy_mwh for row in dispatch if row.action != "idle")
    degradation = throughput * request.battery.degradation_cost_eur_per_mwh
    transaction_fees = sum(row.transaction_fee_eur for row in dispatch)
    # Reconcile the public daily total to the cent-rounded interval ledger.
    contribution = sum(row.interval_pnl_eur for row in dispatch)
    incremental_energy = max(proposal["proposal_terminal_soc_mwh"] - request.battery.target_soc_mwh, 0)
    terminal_energy_value = round(incremental_energy * terminal_value, 2)
    for order in orders:
        if order.delivery_start_utc in stable_intervals:
            order.confidence = "high"
            order.explanation += "; direction is stable across downside, expected and upside cases"
    created_at = datetime.now(timezone.utc)
    forecast_metadata = request.forecast.model_copy(update={
        "created_at_utc": request.forecast.created_at_utc or created_at,
    })
    input_hash = hashlib.sha256(json.dumps(request.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()[:16]
    sensitivities = _sensitivities(request, prices, round(contribution, 2), terminal_value)
    result = SimulationResult(
        simulation_id=simulation_id,
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
        summary={
            "expected_contribution_eur": proposal["proposal_contribution_eur"],
            "optimized_contribution_eur": round(contribution, 2),
            "baseline_proposal_contribution_eur": proposal["proposal_contribution_eur"],
            **{key: value for key, value in proposal.items() if key not in {"implied_soc_mwh", "implied_dispatch"}},
            "trader_adjustment_delta_eur": 0,
            "sales_revenue_eur": round(sales_revenue, 2),
            "purchase_cost_eur": round(charge_cost, 2),
            "degradation_cost_eur": round(degradation, 2),
            "transaction_fee_eur": round(transaction_fees, 2),
            "charged_grid_mwh": round(charge_grid, 3),
            "discharged_grid_mwh": round(discharge_grid, 3),
            "throughput_mwh": round(throughput, 3),
            "equivalent_cycles": round(throughput / (2 * request.battery.capacity_mwh), 3),
            "min_soc_mwh": min((row.soc_mwh for row in dispatch), default=request.battery.initial_soc_mwh),
            "max_soc_mwh": max((row.soc_mwh for row in dispatch), default=request.battery.initial_soc_mwh),
            "order_count": len(orders),
            "buy_volume_mwh": round(sum(o.energy_mwh for o in orders if o.side == "BUY"), 3),
            "sell_volume_mwh": round(sum(o.energy_mwh for o in orders if o.side == "SELL"), 3),
            "executable_rounding_delta_eur": order_generation["contribution_delta_eur"],
            "terminal_energy_value_eur": terminal_energy_value,
            "total_decision_value_eur": round(proposal["proposal_contribution_eur"] + terminal_energy_value, 2),
        },
        optimization=optimization,
        proposal=proposal,
        audit={"schema_version": 5, "input_hash": input_hash, "forecast_version": request.forecast.version, "optimizer_version": optimization["engine"], "validation_version": "physical_and_order_validation_v4", "modified_by_trader": False, "assumption_sources": {
            "battery.capacity_mwh": "IWB task baseline",
            "battery.power_limits": "IWB task baseline / user input",
            "market.product_minutes": "Market configuration assumption",
            "market.exchange_fee": "IWB contract value" if request.market.exchange_fee_policy == "configured" else "Excluded; IWB confirmation required",
            "market.clearing_fee": "ECC public tariff assumption",
            "forecast": f"{request.forecast.source_type}: {request.forecast.source_name}",
        }},
        order_generation=order_generation,
        risk=risk,
        horizon={
            "policy": request.horizon_policy,
            "terminal_value_eur_per_mwh": terminal_value,
            "reserve_soc_mwh": request.battery.target_soc_mwh,
            "terminal_soc_mwh": proposal["proposal_terminal_soc_mwh"],
            "incremental_stored_energy_mwh": round(incremental_energy, 3),
            "terminal_energy_value_eur": terminal_energy_value,
            "lookahead_hours": request.lookahead_hours if request.horizon_policy in {"next_day_proxy", "multi_day"} else 0,
            "continuation_forecast_version": request.forecast.version if request.horizon_policy in {"next_day_proxy", "multi_day"} else None,
        },
        forecast=forecast_metadata,
        forecast_points=base_prices,
        sensitivities=sensitivities,
    )
    payload = result.model_dump(mode="json")
    save_simulation_with_event(payload, created_at.isoformat(), "SIMULATION_CREATED", {"schema_version": 5, "input_hash": input_hash, "validation": validation_status, "optimizer": optimization["engine"]})
    return result


def _sensitivities(request, prices, baseline, terminal_value):
    """Small deterministic perturbations, calculated from the same forecast snapshot."""
    specs = [
        ("cycles", "Daily cycle budget", "max_equivalent_cycles", 0.1, "EFC"),
        ("grid", "Grid connection", "grid_limit_mw", 1.0, "MW"),
        ("capacity", "Usable energy capacity", "max_soc_mwh", 1.0, "MWh"),
        ("efficiency", "Round-trip efficiency", "round_trip_efficiency", 0.01, "pp"),
        ("degradation", "Degradation cost", "degradation_cost_eur_per_mwh", 1.0, "€/MWh"),
    ]
    items = []
    for key, label, field, delta, unit in specs:
        before = getattr(request.battery, field)
        after = before + delta
        if field == "max_soc_mwh": after = min(request.battery.capacity_mwh, after)
        if field == "round_trip_efficiency": after = min(1.0, after)
        if after == before:
            continue
        battery = request.battery.model_copy(update={field: after})
        try:
            dispatch, _ = optimize_dispatch(prices, battery, request.market, terminal_value)
            value = round(sum(row.interval_pnl_eur for row in dispatch), 2)
            change = round(value - baseline, 2)
        except ValueError:
            change = 0.0
        items.append({
            "key": key, "label": label, "baseline_value": before, "tested_value": after,
            "unit": unit, "contribution_delta_eur": change,
            "marginal_value_eur": round(change / (after - before), 2),
            "interpretation": "Local sensitivity under the same forecast and all other saved assumptions.",
        })
    return sorted(items, key=lambda item: abs(item["contribution_delta_eur"]), reverse=True)
