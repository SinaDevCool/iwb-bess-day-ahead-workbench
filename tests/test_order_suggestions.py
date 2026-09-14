"""Suggestions are additions; all acceptance checks use the actual order engine."""

import pytest
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.orders import SubmittedOrder
from backend.domain.schemas.order_suggestions import SuggestionSelection
from backend.services.forecast_resolution import resolve_forecast
from backend.services.order_suggestion_service import suggest_orders
from backend.services.order_suggestion_validation import validate_selection, input_hash


def case(minutes=60, date="2026-09-09"):
    return OrderSimulationRequest(delivery_date=date, market={"product_minutes": minutes})


def order(request, index, side="BUY", volume=10, limit=None):
    return SubmittedOrder(
        client_order_id=f"manual-{index}-{side}",
        delivery_start_utc=resolve_forecast(request)[index].timestamp_utc,
        side=side,
        order_type="MARKET" if limit is None else "LIMIT",
        volume_mw=volume,
        limit_price_eur_mwh=limit,
    )


@pytest.mark.parametrize("minutes", [15, 60])
@pytest.mark.parametrize("date", ["2026-09-09", "2026-03-29", "2026-10-25"])
def test_additions_preserve_baseline_and_validate(minutes, date):
    request = case(minutes, date)
    request.orders = [order(request, 0)]
    original = request.model_dump()
    result = suggest_orders(request)
    assert request.model_dump() == original
    assert result.validation.feasible
    assert result.orders
    assert all(o.client_order_id.startswith("suggested-") for o in result.orders)
    assert all(abs(o.volume_mw / 0.1 - round(o.volume_mw / 0.1)) < 1e-6 for o in result.orders)
    # Repeated acceptance is rejected by canonical unique-ID validation.
    with pytest.raises(ValueError):
        validate_selection(
            SuggestionSelection(
                baseline=request, input_hash=result.input_hash, selected_orders=result.orders * 2
            )
        )


def test_partial_selection_can_be_infeasible_and_stale_hash_rejected():
    request = case()
    request.battery.initial_soc_mwh = 10
    result = suggest_orders(request)
    sells = [o for o in result.orders if o.side == "SELL"]
    checked = validate_selection(
        SuggestionSelection(baseline=request, input_hash=result.input_hash, selected_orders=sells)
    )
    assert not checked.feasible
    assert checked.issues
    with pytest.raises(ValueError, match="Inputs changed"):
        validate_selection(SuggestionSelection(baseline=request, input_hash="old"))


def test_conflicting_manual_orders_and_power_excess_are_not_replaced():
    request = case()
    request.orders = [order(request, 0), order(request, 0, "SELL")]
    with pytest.raises(ValueError, match="Conflicting"):
        suggest_orders(request)
    request.orders = [order(request, 0, volume=60)]
    with pytest.raises(ValueError, match="power or availability"):
        suggest_orders(request)


def test_unavailable_baseline_blocks_and_price_rejected_order_does_not():
    request = case()
    request.battery.unavailable_intervals = [0]
    request.orders = [order(request, 0)]
    with pytest.raises(ValueError, match="power or availability"):
        suggest_orders(request)
    request.orders = [order(request, 0, limit=-500)]
    assert suggest_orders(request).validation.feasible


def test_additions_repair_manual_sell_and_reserve():
    request = case()
    request.battery.initial_soc_mwh = 10
    request.orders = [order(request, 18, "SELL", 30)]
    result = suggest_orders(request)
    assert result.validation.feasible
    assert result.validation.improvement_eur is None
    assert any(o.side == "BUY" for o in result.orders)


def test_flat_prices_need_no_additions_and_empty_selection_keeps_baseline():
    request = case()
    request.price_values = [50] * 24
    result = suggest_orders(request)
    assert result.orders == []
    assert validate_selection(
        SuggestionSelection(baseline=request, input_hash=input_hash(request))
    ).feasible


@pytest.mark.parametrize("price", [-100, 0])
def test_nonpositive_forecasts(price):
    request = case()
    request.price_values = [price] * 12 + [100] * 12
    assert suggest_orders(request).validation.feasible


@pytest.mark.parametrize("minutes", [15, 60])
def test_revision_after_manual_charge_keeps_manual_order_and_replaces_old_suggestions(minutes):
    from backend.services.order_suggestion_validation import evaluate

    request = case(minutes)
    original = suggest_orders(request)
    manual = order(request, 2 * 60 // minutes, volume=13)
    request.orders = [manual]
    revised = suggest_orders(request)
    assert revised.validation.feasible
    assert request.orders == [manual]
    combined = request.model_copy(update={"orders": [manual, *revised.orders]})
    simulation = evaluate(combined)
    assert simulation.submitted_portfolio_feasible
    assert simulation.submitted_orders[0] == manual
    old_quantities = [(o.delivery_start_utc, o.side, o.volume_mw) for o in original.orders]
    new_quantities = [(o.delivery_start_utc, o.side, o.volume_mw) for o in revised.orders]
    assert old_quantities != new_quantities


def test_order_provenance_survives_saved_result_without_changing_dispatch():
    from backend.services.order_suggestion_validation import evaluate

    request = case()
    request.orders = [order(request, 0)]
    before = evaluate(request)
    request.orders[0].origin = "suggested"
    request.orders[0].protected = False
    request.orders[0].generation_id = "generation-a"
    after = evaluate(request)
    assert after.dispatch == before.dispatch
    restored = SubmittedOrder.model_validate(after.submitted_orders[0].model_dump())
    assert restored.origin == "suggested"
    assert restored.protected is False
    assert restored.generation_id == "generation-a"


def test_suggestion_solver_has_bounded_deployment_runtime(monkeypatch):
    from backend.optimization import milp_optimizer

    original = milp_optimizer.milp
    observed = []

    def recording_solver(**kwargs):
        observed.append(kwargs["options"]["time_limit"])
        return original(**kwargs)

    monkeypatch.setattr(milp_optimizer, "milp", recording_solver)
    assert suggest_orders(case()).validation.feasible
    assert observed == [20]
