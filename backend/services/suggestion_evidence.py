"""Project canonical simulation evidence into a compact suggestion review response."""

from backend.domain.schemas.order_suggestions import SelectionIssue, SelectionOrderCheck


def selection_evidence(result, baseline_ids):
    outcomes = result.order_results
    failed = [o for o in outcomes if o.execution_status == "PHYSICALLY_INFEASIBLE"]
    first_failure = min((o.submitted_order.delivery_start_utc for o in failed), default=None)
    issues = []
    seen = set()
    for finding in result.validation.findings:
        if finding.severity != "error":
            continue
        key = (finding.interval, finding.code)
        if key in seen:
            continue
        seen.add(key)
        timestamp = (
            result.forecast_points[finding.interval].timestamp_utc
            if finding.interval is not None
            else None
        )
        affected = [
            o.submitted_order
            for o in failed
            if o.submitted_order.delivery_start_utc == timestamp
            and o.reason_code.lower() == finding.code.lower()
        ]
        issues.append(
            SelectionIssue(
                **finding.model_dump(),
                issue_id=f"{finding.interval}:{finding.code}",
                delivery_start_utc=timestamp,
                existing_orders=[o for o in affected if o.client_order_id in baseline_ids],
                selected_order_ids=[
                    o.client_order_id for o in affected if o.client_order_id not in baseline_ids
                ],
            )
        )
    checks = [
        SelectionOrderCheck(
            order_id=o.submitted_order.client_order_id,
            execution_status=o.execution_status,
            reason_code=o.reason_code,
            issue_ids=[
                i.issue_id
                for i in issues
                if o.submitted_order.client_order_id in i.selected_order_ids
            ],
            after_exclusion=first_failure is not None
            and o.submitted_order.delivery_start_utc > first_failure,
        )
        for o in outcomes
        if o.submitted_order.client_order_id not in baseline_ids
    ]
    return issues, checks
