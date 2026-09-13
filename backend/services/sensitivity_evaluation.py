"""Re-optimize controlled changes against an existing snapshot, without saving new runs."""

from __future__ import annotations

from backend.services.decision_support_service import (
    resolve_terminal_value,
    select_risk_aware_dispatch,
)


def evaluate_case(request, base_prices, prices, baseline, definition, value, direction):
    """Re-optimize one case; infeasibility is evidence, never a silent fallback."""
    if value is None or abs(value - definition["baseline"]) < 1e-9:
        return None
    try:
        if definition.get("scope") == "request":
            candidate_request = request.model_copy(update=definition["updates"](value))
        else:
            battery = request.battery.model_copy(update=definition["updates"](value))
            candidate_request = request.model_copy(update={"battery": battery})
        candidate_dispatch, _, _, _ = select_risk_aware_dispatch(
            candidate_request, base_prices, prices, resolve_terminal_value(candidate_request)
        )
        contribution = round(sum(row.interval_pnl_eur for row in candidate_dispatch), 2)
        return {
            "value": value,
            "unit": definition["unit"],
            "contribution_eur": contribution,
            "delta_eur": round(contribution - baseline, 2),
            "feasible": True,
            "explanation": f"Full re-optimization with the {direction} tested value.",
        }
    except ValueError as error:
        return {
            "value": value,
            "unit": definition["unit"],
            "contribution_eur": baseline,
            "delta_eur": 0.0,
            "feasible": False,
            "explanation": str(error),
        }
