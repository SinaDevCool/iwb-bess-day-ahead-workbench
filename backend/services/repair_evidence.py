"""Repair evidence without hypothetical dispatch or an additional constraint model."""

from backend.domain.schemas.order_repair import RepairIssue
from backend.services.order_execution_rules import _clears, independent_batch_issues
from backend.services.suggestion_evidence import selection_evidence


def repair_evidence(baseline, result, points):
    findings, _ = selection_evidence(result, {o.client_order_id for o in baseline.orders})
    schedule_codes = {
        "minimum_soc",
        "maximum_soc",
        "power_limit",
        "unavailable",
        "conflicting_sides",
        "cycle_budget",
        "cycle_limit",
        "terminal_soc",
    }
    # These independent findings are rebuilt using the same checks, including
    # batches excluded before power checks due to conflicting directions.
    issues = [
        RepairIssue(
            **i.model_dump(),
            category="schedule" if i.code in schedule_codes else "technical",
            action="repair" if i.code in schedule_codes else "review_calculation",
        )
        for i in findings
        if i.code not in {"power_limit", "unavailable"}
    ]
    for interval, point in enumerate(points):
        for side in ("BUY", "SELL"):
            orders = [
                o
                for o in baseline.orders
                if o.delivery_start_utc == point.timestamp_utc
                and o.side == side
                and _clears(o, point.price_eur_mwh)
            ]
            for code, message, values in independent_batch_issues(baseline, orders, interval):
                # Individually oversized orders must change. Aggregate excess
                # only proves a group issue, never that every member must change.
                required = [
                    o.client_order_id
                    for o in orders
                    if code == "UNAVAILABLE" or o.volume_mw > values["configured_limit"] + 1e-9
                ]
                issues.append(
                    RepairIssue(
                        severity="error",
                        code=code.lower(),
                        message=message,
                        interval=interval,
                        issue_id=f"{interval}:{code.lower()}:{side}",
                        side=side,
                        delivery_start_utc=point.timestamp_utc,
                        existing_orders=orders,
                        required_revision_ids=required,
                        **values,
                    )
                )
    return issues
