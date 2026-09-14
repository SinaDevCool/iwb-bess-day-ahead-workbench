"""Score legacy optimized candidates across illustrative price cases; not live risk control."""

from __future__ import annotations

from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import DispatchRow, PricePoint, SimulationRequest
from backend.optimization.milp_optimizer import optimize_dispatch
from backend.services.executable_order_service import build_executable_orders
from backend.services.forecast_service import apply_scenario


def select_risk_aware_dispatch(
    request: SimulationRequest,
    base_prices: list[PricePoint],
    current_prices: list[PricePoint],
    terminal_value: float,
):
    """Select one executable portfolio after evaluating it under every price case.

    Candidate schedules are optimized independently, but each candidate's same
    physical actions are repriced across all scenarios before it is scored. This
    avoids comparing three different perfect-foresight portfolios as if they were
    one robust trading decision. This selects the best of three candidates;
    it is not a globally solved stochastic or robust MILP.
    """
    probabilities = request.scenario_probabilities
    definitions = [
        (
            "Downside",
            probabilities.downside,
            apply_scenario(base_prices, 1, max(request.peak_reduction_eur_mwh, 15), True),
        ),
        (
            "Expected",
            probabilities.expected,
            apply_scenario(
                base_prices, request.price_multiplier, request.peak_reduction_eur_mwh, False
            ),
        ),
        ("Upside", probabilities.upside, apply_scenario(base_prices, 1.08, 0, False)),
    ]
    actions_by_time: dict = {}
    candidates = []
    for name, probability, prices in definitions:
        dispatch, evidence = optimize_dispatch(
            prices, request.battery, request.market, terminal_value
        )
        for row in dispatch:
            actions_by_time.setdefault(row.timestamp_utc, []).append(row.action)
        scenario_values = []
        for outcome_name, outcome_probability, outcome_prices in definitions:
            repriced = reprice_dispatch(dispatch, outcome_prices, request)
            _, validation, proposal, _ = build_executable_orders(
                f"risk-{name.lower()}-{outcome_name.lower()}",
                repriced,
                request.market,
                request.battery,
            )
            if validation.status == "failed":
                raise ValueError(f"Risk candidate {name} is not executable in {outcome_name}")
            scenario_values.append(
                {
                    "name": outcome_name,
                    "probability": outcome_probability,
                    "contribution_eur": proposal["proposal_contribution_eur"],
                }
            )
        expected = sum(x["probability"] * x["contribution_eur"] for x in scenario_values)
        worst = min(x["contribution_eur"] for x in scenario_values)
        score = (
            expected
            if request.risk_posture == "expected_value"
            else worst
            if request.risk_posture == "downside_protected"
            else expected - 0.35 * (expected - worst)
        )
        candidates.append(
            {
                "name": name,
                "dispatch": dispatch,
                "evidence": evidence,
                "outcomes": scenario_values,
                "expected": expected,
                "worst": worst,
                "score": score,
            }
        )
    selected = max(candidates, key=lambda item: item["score"])
    outcomes = selected["outcomes"]
    expected = selected["expected"]
    downside, upside = outcomes[0]["contribution_eur"], outcomes[2]["contribution_eur"]
    recommended = selected["name"]
    stable_intervals = {
        timestamp
        for timestamp, actions in actions_by_time.items()
        if len(actions) == 3 and actions[0] != "idle" and len(set(actions)) == 1
    }
    display_dispatch = reprice_dispatch(selected["dispatch"], current_prices, request)
    evidence = selected["evidence"]
    evidence["objective"] += (
        f"; {request.risk_posture.replace('_', ' ')} portfolio selected across three price cases"
    )
    return (
        display_dispatch,
        evidence,
        {
            "posture": request.risk_posture,
            "expected_contribution_eur": round(expected, 2),
            "downside_contribution_eur": round(downside, 2),
            "upside_contribution_eur": round(upside, 2),
            "worst_case_contribution_eur": round(min(x["contribution_eur"] for x in outcomes), 2),
            "value_range_eur": round(
                max(x["contribution_eur"] for x in outcomes)
                - min(x["contribution_eur"] for x in outcomes),
                2,
            ),
            "recommended_scenario": recommended,
            "recommendation": f"The {recommended.lower()}-optimized executable portfolio has the strongest {request.risk_posture.replace('_', ' ')} score when the same orders are valued under all three price cases; retain trader approval before export.",
            "outcomes": outcomes,
        },
        stable_intervals,
    )


def reprice_dispatch(
    dispatch: list[DispatchRow], prices: list[PricePoint], request: SimulationRequest
) -> list[DispatchRow]:
    """Keep a candidate's physical schedule and calculate economics at new prices."""
    by_time = {point.timestamp_utc: point.price_eur_mwh for point in prices}
    fee = effective_transaction_fee(request.market)
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
        result.append(
            row.model_copy(
                update={
                    "price_eur_mwh": price,
                    "interval_pnl_eur": pnl,
                    "cumulative_pnl_eur": round(cumulative, 2),
                    "sales_revenue_eur": sales,
                    "purchase_cost_eur": purchases,
                    "degradation_cost_eur": degradation,
                    "transaction_fee_eur": transaction,
                }
            )
        )
    return result
