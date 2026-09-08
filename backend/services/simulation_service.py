from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from backend.db.repository import save_simulation_with_event
from backend.domain.models import SimulationRequest, SimulationResult
from backend.optimization.milp_optimizer import optimize_dispatch
from backend.services.forecast_service import apply_scenario, build_demo_forecast
from backend.services.order_service import build_orders
from backend.validation.validators import validate_dispatch, validate_order_proposal


def run_simulation(request: SimulationRequest) -> SimulationResult:
    base_prices = request.prices or build_demo_forecast(request.delivery_date, request.market)
    prices = apply_scenario(
        base_prices,
        multiplier=request.price_multiplier,
        peak_reduction=request.peak_reduction_eur_mwh,
        conservative=request.strategy == "conservative",
    )
    dispatch, optimization = optimize_dispatch(prices, request.battery, request.market)
    simulation_id = f"sim-{uuid4().hex[:10]}"
    orders = build_orders(simulation_id, dispatch, request.market, request.battery)
    dispatch_validation = validate_dispatch(dispatch, request.battery)
    order_validation, proposal = validate_order_proposal(orders, request.market, request.battery, dispatch)
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
    created_at = datetime.now(timezone.utc)
    input_hash = hashlib.sha256(json.dumps(request.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()[:16]
    result = SimulationResult(
        simulation_id=simulation_id,
        created_at_utc=created_at,
        delivery_date=request.delivery_date,
        scenario_name=request.scenario_name,
        strategy=request.strategy,
        price_multiplier=request.price_multiplier,
        peak_reduction_eur_mwh=request.peak_reduction_eur_mwh,
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
        },
        optimization=optimization,
        proposal=proposal,
        audit={"schema_version": 2, "input_hash": input_hash, "forecast_version": "illustrative-v1", "optimizer_version": optimization["engine"], "validation_version": "order_proposal_validation_v2", "modified_by_trader": False},
    )
    payload = result.model_dump(mode="json")
    save_simulation_with_event(payload, created_at.isoformat(), "SIMULATION_CREATED", {"schema_version": 2, "input_hash": input_hash, "validation": validation_status, "optimizer": optimization["engine"]})
    return result
