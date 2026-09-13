"""Re-optimize controlled changes against an existing snapshot, without saving new runs."""

from __future__ import annotations

from backend.domain.models import DispatchRow, SimulationRequest
from backend.services.decision_support_service import (
    resolve_terminal_value,
)
from backend.services.forecast_service import apply_scenario


from backend.services.sensitivity_definitions import operating_levers
from backend.services.sensitivity_evaluation import evaluate_case


def sensitivities_for_snapshot(payload: dict):
    """Compute evidence from a saved optimizer snapshot without creating another run."""
    if payload.get("audit", {}).get("modified_by_trader"):
        raise ValueError(
            "Generate a fresh proposal before evaluating sensitivities of trader-edited orders"
        )
    if payload.get("sensitivities"):
        return payload["sensitivities"]
    if not payload.get("forecast_points"):
        raise ValueError("This older run has no exact forecast snapshot; generate a new proposal")
    request = SimulationRequest.model_validate(
        {**payload, "prices": payload["forecast_points"], "include_sensitivities": False}
    )
    prices = apply_scenario(
        request.prices,
        request.price_multiplier,
        request.peak_reduction_eur_mwh,
        request.scenario_name.casefold() == "downside" or request.strategy == "conservative",
    )
    dispatch = [DispatchRow.model_validate(row) for row in payload["dispatch"]]
    return calculate_sensitivities(
        request,
        request.prices,
        prices,
        dispatch,
        payload["summary"]["optimized_contribution_eur"],
        resolve_terminal_value(request),
    )


def calculate_sensitivities(
    request, base_prices, prices, baseline_dispatch, baseline, terminal_value
):
    """Re-optimize feasible operating decisions without presenting fixed asset facts as trader levers."""
    definitions = operating_levers(request, baseline_dispatch, terminal_value)

    items = []
    for definition in definitions:
        lower_case = evaluate_case(
            request, base_prices, prices, baseline, definition, definition["lower"], "lower"
        )
        upper_case = evaluate_case(
            request, base_prices, prices, baseline, definition, definition["upper"], "upper"
        )
        cases = [case for case in (lower_case, upper_case) if case and case["feasible"]]
        representative = max(cases, key=lambda case: abs(case["delta_eur"]), default=None)
        if representative is None:
            continue
        display_delta = representative["value"] - definition["baseline"]
        items.append(
            {
                "key": definition["key"],
                "label": definition["label"],
                "baseline_value": definition["baseline"],
                "tested_value": representative["value"],
                "unit": definition["unit"],
                "contribution_delta_eur": representative["delta_eur"],
                "marginal_value_eur": round(representative["delta_eur"] / display_delta, 2)
                if display_delta
                else 0,
                "interpretation": definition["interpretation"],
                "category": definition.get("category", "operational"),
                "default_selected": definition.get("category", "operational") == "operational",
                "lower_case": lower_case,
                "upper_case": upper_case,
                "calculation": "full_reoptimization",
            }
        )
    return sorted(
        items,
        key=lambda item: max(
            abs((item["lower_case"] or {}).get("delta_eur", 0)),
            abs((item["upper_case"] or {}).get("delta_eur", 0)),
        ),
        reverse=True,
    )
