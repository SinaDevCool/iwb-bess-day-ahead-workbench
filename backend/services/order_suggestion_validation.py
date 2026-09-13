"""Pure preview checks: no saved runs are created when selection changes."""

import hashlib
import json
from datetime import datetime, timezone
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.order_suggestions import SelectionResult, SuggestionSelection
from backend.services.order_simulation_engine import calculate_order_simulation


def input_hash(request: OrderSimulationRequest) -> str:
    return hashlib.sha256(
        json.dumps(request.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()


def evaluate(request: OrderSimulationRequest):
    return calculate_order_simulation(
        request,
        created=datetime(2000, 1, 1, tzinfo=timezone.utc),
        simulation_id="suggestion-preview",
    )


def validate_selection(selection: SuggestionSelection) -> SelectionResult:
    if input_hash(selection.baseline) != selection.input_hash:
        raise ValueError("Inputs changed. Generate new suggestions.")
    # Re-parse instead of model_copy: enforce unique IDs, ticks and interval bounds.
    combined = OrderSimulationRequest.model_validate(
        {
            **selection.baseline.model_dump(),
            "orders": [*selection.baseline.orders, *selection.selected_orders],
        }
    )
    baseline = evaluate(selection.baseline)
    result = evaluate(combined)
    return SelectionResult(
        feasible=result.submitted_portfolio_feasible,
        contribution_eur=result.summary.net_contribution_eur,
        improvement_eur=round(
            result.summary.net_contribution_eur - baseline.summary.net_contribution_eur, 2
        )
        if baseline.submitted_portfolio_feasible
        else None,
        issues=list(
            dict.fromkeys(f.message for f in result.validation.findings if f.severity == "error")
        ),
    )
