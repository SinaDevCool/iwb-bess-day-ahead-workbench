"""Row attribution comes from combined execution, not standalone suggestion checks."""

import pytest
from test_order_suggestions import case, order
from backend.domain.schemas.order_suggestions import SuggestionSelection
from backend.services.order_suggestion_validation import input_hash, validate_selection


@pytest.mark.parametrize("minutes", [15, 60])
@pytest.mark.parametrize("date", ["2026-09-09", "2026-10-25"])
def test_shared_batch_evidence_and_downstream_recheck(minutes, date):
    request = case(minutes, date)
    request.battery.initial_soc_mwh = 89
    manual = order(request, 0, volume=5)
    request.orders = [manual]
    addition = order(request, 0, volume=5).model_copy(update={"client_order_id": "suggested"})
    later = order(request, 1, "SELL", 1)
    checked = validate_selection(
        SuggestionSelection(
            baseline=request, input_hash=input_hash(request), selected_orders=[addition, later]
        )
    )
    issue = next(i for i in checked.interval_issues if i.code.lower() == "maximum_soc")
    assert issue.delivery_start_utc == addition.delivery_start_utc
    assert issue.selected_order_ids == ["suggested"]
    assert [o.client_order_id for o in issue.existing_orders] == [manual.client_order_id]
    assert issue.observed_value > issue.configured_limit == 90
    assert checked.order_checks[0].issue_ids == [issue.issue_id]
    assert checked.order_checks[1].after_exclusion


def test_identical_messages_keep_distinct_interval_ids():
    request = case()
    request.battery.initial_soc_mwh = 89
    additions = [order(request, i, volume=5) for i in [0, 1]]
    checked = validate_selection(
        SuggestionSelection(
            baseline=request, input_hash=input_hash(request), selected_orders=additions
        )
    )
    issues = [i for i in checked.interval_issues if i.code.lower() == "maximum_soc"]
    assert len(issues) == 2
    assert issues[0].issue_id != issues[1].issue_id
    assert issues[0].selected_order_ids != issues[1].selected_order_ids
