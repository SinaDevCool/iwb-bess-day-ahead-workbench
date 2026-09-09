from __future__ import annotations

from datetime import datetime, timedelta

from backend.domain.economics import calculate_interval
from backend.domain.models import DispatchRow, Order, PricePoint, SimulationRequest
from backend.optimization.milp_optimizer import optimize_dispatch
from backend.services.forecast_service import apply_scenario, build_demo_forecast
from backend.services.order_service import build_orders
from backend.validation.validators import validate_order_proposal


def resolve_terminal_value(request: SimulationRequest) -> float:
    """Resolve the configured continuation value without pretending it is market data."""
    if request.horizon_policy == "minimum_reserve":
        return 0.0
    if request.horizon_policy == "terminal_value":
        return request.terminal_value_eur_per_mwh
    next_date = (datetime.strptime(request.delivery_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    next_prices = build_demo_forecast(next_date, request.market)
    count = max(1, int(request.lookahead_hours * 60 / request.market.product_minutes))
    # Replacement-value proxy from the early next-day forecast. It is exposed
    # explicitly as illustrative in the API/UI, not mixed into cash contribution.
    return round(sum(p.price_eur_mwh for p in next_prices[:count]) / min(count, len(next_prices)), 2)


def build_executable_orders(simulation_id, dispatch, market, battery):
    """Quantize and repair orders until their reconstructed schedule is feasible."""
    raw_volume = sum(abs(row.power_mw) * market.product_minutes / 60 for row in dispatch if row.action != "idle")
    raw_contribution = round(sum(row.interval_pnl_eur for row in dispatch), 2)
    orders = build_orders(simulation_id, dispatch, market, battery)
    adjusted = sum(1 for row in dispatch if row.action != "idle" and not any(o.delivery_start_utc == row.timestamp_utc and abs(o.volume_mw - abs(row.power_mw)) < 1e-7 for o in orders))
    repaired = 0
    validation, proposal = validate_order_proposal(orders, market, battery, dispatch)
    while validation.status == "failed" and repaired < 10000 and orders:
        codes = {finding.code for finding in validation.findings if finding.severity == "error"}
        if codes & {"proposal_soc_below_min", "proposal_terminal_soc"}:
            candidates = [o for o in orders if o.side == "SELL"]
        elif "proposal_soc_above_max" in codes:
            candidates = [o for o in orders if o.side == "BUY"]
        else:
            candidates = sorted(orders, key=lambda o: abs(o.expected_contribution_eur / max(o.energy_mwh, 1e-9)))
        if not candidates:
            break
        order = candidates[-1] if codes & {"proposal_soc_below_min", "proposal_terminal_soc", "proposal_soc_above_max"} else candidates[0]
        new_volume = round(order.volume_mw - market.volume_increment_mw, 6)
        if new_volume <= 0:
            orders.remove(order)
        else:
            _update_order(order, new_volume, market, battery)
        repaired += 1
        validation, proposal = validate_order_proposal(orders, market, battery, dispatch)
    if validation.status == "failed":
        raise ValueError("Rounded auction orders could not be repaired into a physically feasible package")
    final_volume = sum(o.energy_mwh for o in orders)
    evidence = {
        "method": "conservative floor to market increment, followed by physical reconstruction and repair",
        "volume_increment_mw": market.volume_increment_mw,
        "adjusted_order_count": adjusted,
        "repaired_order_count": repaired,
        "volume_reduction_mwh": round(raw_volume - final_volume, 4),
        "contribution_delta_eur": round(proposal["proposal_contribution_eur"] - raw_contribution, 2),
        "validation_status": validation.status,
    }
    return orders, validation, proposal, evidence


def _update_order(order: Order, volume: float, market, battery):
    economics = calculate_interval(order.side, volume, market.product_minutes / 60, order.expected_price_eur_mwh, battery, market.exchange_fee_eur_per_mwh + market.clearing_fee_eur_per_mwh)
    order.volume_mw = volume
    order.energy_mwh = round(economics.grid_energy_mwh, 4)
    order.sales_revenue_eur = round(economics.sales_revenue_eur, 2)
    order.purchase_cost_eur = round(economics.purchase_cost_eur, 2)
    order.degradation_cost_eur = round(economics.degradation_cost_eur, 2)
    order.transaction_fee_eur = round(economics.transaction_fee_eur, 2)
    order.expected_contribution_eur = round(order.sales_revenue_eur - order.purchase_cost_eur - order.degradation_cost_eur - order.transaction_fee_eur, 2)


def select_risk_aware_dispatch(request: SimulationRequest, base_prices: list[PricePoint], current_prices: list[PricePoint], terminal_value: float):
    """Select one executable portfolio after evaluating it under every price case.

    Candidate schedules are optimized independently, but each candidate's same
    physical actions are repriced across all scenarios before it is scored. This
    avoids comparing three different perfect-foresight portfolios as if they were
    one robust trading decision.
    """
    definitions = [
        ("Downside", 0.2, apply_scenario(base_prices, 1, max(request.peak_reduction_eur_mwh, 15), True)),
        ("Expected", 0.6, apply_scenario(base_prices, request.price_multiplier, request.peak_reduction_eur_mwh, False)),
        ("Upside", 0.2, apply_scenario(base_prices, 1.08, 0, False)),
    ]
    actions_by_time: dict = {}
    candidates = []
    for name, probability, prices in definitions:
        dispatch, evidence = optimize_dispatch(prices, request.battery, request.market, terminal_value)
        for row in dispatch:
            actions_by_time.setdefault(row.timestamp_utc, []).append(row.action)
        scenario_values = []
        for outcome_name, outcome_probability, outcome_prices in definitions:
            repriced = reprice_dispatch(dispatch, outcome_prices, request)
            _, validation, proposal, _ = build_executable_orders(f"risk-{name.lower()}-{outcome_name.lower()}", repriced, request.market, request.battery)
            if validation.status == "failed":
                raise ValueError(f"Risk candidate {name} is not executable in {outcome_name}")
            scenario_values.append({"name": outcome_name, "probability": outcome_probability, "contribution_eur": proposal["proposal_contribution_eur"]})
        expected = sum(x["probability"] * x["contribution_eur"] for x in scenario_values)
        worst = min(x["contribution_eur"] for x in scenario_values)
        score = expected if request.risk_posture == "expected_value" else worst if request.risk_posture == "downside_protected" else expected - 0.35 * (expected - worst)
        candidates.append({"name": name, "dispatch": dispatch, "evidence": evidence, "outcomes": scenario_values, "expected": expected, "worst": worst, "score": score})
    selected = max(candidates, key=lambda item: item["score"])
    outcomes = selected["outcomes"]
    expected = selected["expected"]
    downside, upside = outcomes[0]["contribution_eur"], outcomes[2]["contribution_eur"]
    recommended = selected["name"]
    stable_intervals = {timestamp for timestamp, actions in actions_by_time.items() if len(actions) == 3 and actions[0] != "idle" and len(set(actions)) == 1}
    display_dispatch = reprice_dispatch(selected["dispatch"], current_prices, request)
    evidence = selected["evidence"]
    evidence["objective"] += f"; {request.risk_posture.replace('_', ' ')} portfolio selected across three price cases"
    return display_dispatch, evidence, {
        "posture": request.risk_posture,
        "expected_contribution_eur": round(expected, 2),
        "downside_contribution_eur": round(downside, 2),
        "upside_contribution_eur": round(upside, 2),
        "worst_case_contribution_eur": round(min(x["contribution_eur"] for x in outcomes), 2),
        "value_range_eur": round(max(x["contribution_eur"] for x in outcomes) - min(x["contribution_eur"] for x in outcomes), 2),
        "recommended_scenario": recommended,
        "recommendation": f"The {recommended.lower()}-optimized executable portfolio has the strongest {request.risk_posture.replace('_', ' ')} score when the same orders are valued under all three price cases; retain trader approval before export.",
        "outcomes": outcomes,
    }, stable_intervals


def reprice_dispatch(dispatch: list[DispatchRow], prices: list[PricePoint], request: SimulationRequest) -> list[DispatchRow]:
    """Keep a candidate's physical schedule and calculate economics at new prices."""
    by_time = {point.timestamp_utc: point.price_eur_mwh for point in prices}
    fee = request.market.exchange_fee_eur_per_mwh + request.market.clearing_fee_eur_per_mwh
    dt = request.market.product_minutes / 60
    cumulative = 0.0
    result = []
    for row in dispatch:
        price = by_time[row.timestamp_utc]
        if row.action == "idle":
            sales = purchases = degradation = transaction = pnl = 0.0
        else:
            side = "BUY" if row.action == "charge" else "SELL"
            economics = calculate_interval(side, abs(row.power_mw), dt, price, request.battery, fee)
            sales = round(economics.sales_revenue_eur, 2)
            purchases = round(economics.purchase_cost_eur, 2)
            degradation = round(economics.degradation_cost_eur, 2)
            transaction = round(economics.transaction_fee_eur, 2)
            pnl = round(sales - purchases - degradation - transaction, 2)
        cumulative += pnl
        result.append(row.model_copy(update={
            "price_eur_mwh": price,
            "interval_pnl_eur": pnl,
            "cumulative_pnl_eur": round(cumulative, 2),
            "sales_revenue_eur": sales,
            "purchase_cost_eur": purchases,
            "degradation_cost_eur": degradation,
            "transaction_fee_eur": transaction,
        }))
    return result
