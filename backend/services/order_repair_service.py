"""Diagnose and validate complete portfolio revisions without persistence."""

import hashlib
import json
from backend.domain.schemas.order_repair import RepairResult, can_revise
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.services.order_suggestion_validation import evaluate
from backend.services.repair_evidence import repair_evidence
from backend.services.forecast_resolution import resolve_forecast
from backend.services.order_execution_rules import _clears
from backend.optimization.repair_optimizer import optimize_repair


def repair_hash(request):
    # Binds baseline and permissions for consistency, not authentication/signing.
    # Candidate orders are checked separately, rather than included in this hash.
    payload = request.model_dump(mode="json", exclude={"input_hash", "proposed_orders"})
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def validate_repair(request):
    """Recheck candidate permissions and physics independently of solver success.

    Existing eligible orders may only be reduced/removed with authorization;
    ineligible orders stay intact and additions require explicit permission.
    """
    if request.input_hash != repair_hash(request):
        raise ValueError("Inputs or repair permissions changed. Recalculate the plan.")
    candidate = OrderSimulationRequest.model_validate(
        {**request.baseline.model_dump(), "orders": request.proposed_orders}
    )
    after = {o.client_order_id: o for o in candidate.orders}
    points = {p.timestamp_utc: p.price_eur_mwh for p in resolve_forecast(request.baseline)}
    original_ids = {o.client_order_id for o in request.baseline.orders}
    for old in request.baseline.orders:
        new = after.get(old.client_order_id)
        permitted = can_revise(request, old) and _clears(old, points[old.delivery_start_utc])
        if not permitted:
            if new != old:
                raise ValueError("A protected or price-ineligible order was changed")
        elif new is not None:
            if new.volume_mw > old.volume_mw or new.model_dump(
                exclude={"volume_mw"}
            ) != old.model_dump(exclude={"volume_mw"}):
                raise ValueError("Repair may only reduce authorized existing quantities")
    for new in candidate.orders:
        if new.client_order_id in original_ids:
            continue
        if (
            not request.allow_additions
            or new.origin != "suggested"
            or new.protected
            or new.order_type != "LIMIT"
        ):
            raise ValueError("Unauthorized added order")
        if not _clears(new, points[new.delivery_start_utc]):
            raise ValueError("Added orders must qualify under the current forecast")
    # Reuse full-day execution, including terminal reserve, before allowing Apply.
    result = evaluate(candidate)
    if not result.submitted_portfolio_feasible:
        raise ValueError("The complete revised portfolio still has blocking schedule issues")
    return RepairResult(
        input_hash=repair_hash(request),
        status="ready",
        message="Feasible under the current forecast",
        orders=candidate.orders,
        contribution_eur=result.summary.net_contribution_eur,
    )


def repair_orders(request):
    from backend.domain.schemas.order_repair import RepairCheck

    before = evaluate(request.baseline)
    points = resolve_forecast(request.baseline)
    issues = repair_evidence(request.baseline, before, points)
    key = repair_hash(request)
    if any(i.category == "technical" for i in issues):
        return RepairResult(
            input_hash=key,
            status="error",
            message="Schedule calculation needs review. No order corrections were applied.",
            issues=issues,
        )
    if before.submitted_portfolio_feasible:
        return RepairResult(
            input_hash=key,
            status="unchanged",
            message="No blocking schedule issues. Price-rejected orders are not a feasibility error.",
            orders=request.baseline.orders,
            contribution_eur=before.summary.net_contribution_eur,
            optimal=True,
        )
    status, orders = optimize_repair(request, points)
    if status != "ready":
        messages = {
            "blocked": "No feasible repair with the current permissions. Review protected orders or battery settings.",
            "timeout": "Repair reached its time limit; no orders changed. Retry or narrow the permitted changes.",
            "error": "Repair could not complete; no orders changed. Review the inputs or retry.",
        }
        return RepairResult(input_hash=key, status=status, message=messages[status], issues=issues)
    checked = validate_repair(
        RepairCheck(**request.model_dump(), input_hash=key, proposed_orders=orders)
    )
    return checked.model_copy(update={"issues": issues, "optimal": True})
