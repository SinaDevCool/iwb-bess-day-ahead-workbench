from itertools import combinations

import pytest

from backend.domain.schemas.order_repair import RepairRequest
from backend.services.order_repair_service import repair_orders
from backend.services.order_suggestion_validation import evaluate
from backend.services.repair_evidence import repair_evidence
from backend.services.forecast_resolution import resolve_forecast
from tests.test_order_repair import case, add, validate


@pytest.mark.parametrize("minutes", [15, 60])
def test_conflict_does_not_hide_independent_limits_or_change_execution(minutes):
    baseline = case(minutes)
    buy = add(baseline, 10, 65)
    sell = add(baseline, 10, 60, side="SELL")
    before = evaluate(baseline)
    issues = repair_evidence(baseline, before, resolve_forecast(baseline))
    assert [o.reason_code for o in before.order_results] == ["CONFLICTING_SIDES"] * 2
    assert len(issues) == 3
    assert len({i.issue_id for i in issues}) == 3
    powers = {i.side: i for i in issues if i.code == "power_limit"}
    assert powers["BUY"].required_revision_ids == [buy.client_order_id]
    assert powers["SELL"].required_revision_ids == [sell.client_order_id]
    assert powers["BUY"].configured_limit == 50
    assert evaluate(baseline) == before
    assert not any(i.code in {"maximum_soc", "minimum_soc"} for i in issues)


def test_aggregate_excess_is_group_evidence_not_individual_blame():
    # Individually legal orders may exceed a shared limit together; involvement
    # must not be presented as proof that every order requires permission.
    baseline = case()
    add(baseline, 10, 30)
    add(baseline, 10, 30)
    result = repair_orders(RepairRequest(baseline=baseline))
    assert result.status == "blocked"
    issue = next(i for i in result.issues if i.code == "power_limit")
    assert len(issue.existing_orders) == 2
    assert issue.required_revision_ids == []


def test_unavailable_and_power_are_both_reported_but_ineligible_is_not_blamed():
    baseline = case(unavailable_intervals=[10])
    eligible = add(baseline, 10, 65)
    ineligible = add(baseline, 10, 80, side="SELL", limit=1000)
    result = repair_orders(RepairRequest(baseline=baseline))
    assert {i.code for i in result.issues} == {"power_limit", "unavailable"}
    assert all(i.required_revision_ids == [eligible.client_order_id] for i in result.issues)
    assert all(ineligible not in i.existing_orders for i in result.issues)


@pytest.mark.parametrize("minutes", [15, 60])
@pytest.mark.parametrize("additions", [False, True])
def test_permission_matrix_only_necessary_permission_is_required(minutes, additions):
    baseline = case(minutes)
    early = add(baseline, 2, 10)
    rejected = add(baseline, 9, 65, side="SELL", limit=1000)
    offender = add(baseline, 10, 65)
    add(baseline, 10, 5, side="SELL", suggested=True)
    ids = [early.client_order_id, rejected.client_order_id, offender.client_order_id]
    for count in range(4):
        for allowed in combinations(ids, count):
            request = RepairRequest(
                baseline=baseline, allow_revision_ids=list(allowed), allow_additions=additions
            )
            result = repair_orders(request)
            if offender.client_order_id not in allowed:
                assert result.status == "blocked"
            else:
                validate(request, result)
                assert (
                    next(o for o in result.orders if o.client_order_id == rejected.client_order_id)
                    == rejected
                )


def test_price_ineligible_portfolio_is_unchanged():
    baseline = case()
    add(baseline, 10, 65, limit=-100)
    result = repair_orders(RepairRequest(baseline=baseline))
    assert result.status == "unchanged"
    assert result.issues == []
