import pytest
from backend.domain.schemas.order_repair import RepairRequest, RepairCheck
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.orders import SubmittedOrder
from backend.services.forecast_resolution import resolve_forecast
from backend.services.order_repair_service import repair_orders, validate_repair


def case(minutes=60, **battery):
    return OrderSimulationRequest(
        delivery_date="2026-09-09", market={"product_minutes": minutes}, battery=battery
    )


def add(request, index, volume=50, side="BUY", suggested=False, limit=None):
    o = SubmittedOrder(
        client_order_id=f"order-{len(request.orders)}",
        delivery_start_utc=resolve_forecast(request)[index].timestamp_utc,
        side=side,
        order_type="MARKET" if limit is None else "LIMIT",
        volume_mw=volume,
        limit_price_eur_mwh=limit,
        origin="suggested" if suggested else "manual",
        protected=not suggested,
    )
    request.orders.append(o)
    return o


def validate(request, result):
    assert result.status == "ready"
    return validate_repair(
        RepairCheck(
            **request.model_dump(), input_hash=result.input_hash, proposed_orders=result.orders
        )
    )


@pytest.mark.parametrize("minutes", [15, 60])
def test_power_repair_requires_permission_and_preserves_manual_metadata(minutes):
    baseline = case(minutes)
    order = add(baseline, 0, 60)
    request = RepairRequest(baseline=baseline)
    assert repair_orders(request).status == "blocked"
    request.allow_revision_ids = [order.client_order_id]
    result = repair_orders(request)
    validate(request, result)
    revised = next(o for o in result.orders if o.client_order_id == order.client_order_id)
    assert revised.volume_mw <= 50
    assert revised.origin == "manual" and revised.protected
    assert order.volume_mw == 60


@pytest.mark.parametrize("kind", ["max", "min", "unavailable", "sides", "cycle", "terminal"])
def test_full_day_repair(kind):
    baseline = case()
    if kind == "max":
        add(baseline, 0, 50, suggested=True)
    elif kind == "min":
        add(baseline, 0, 50, side="SELL", suggested=True)
    elif kind == "unavailable":
        baseline.battery.unavailable_intervals = [0]
        add(baseline, 0, 10, suggested=True)
    elif kind == "sides":
        add(baseline, 0, 10, suggested=True)
        add(baseline, 0, 10, side="SELL", suggested=True)
    elif kind == "cycle":
        baseline.battery.max_equivalent_cycles = 0.01
        add(baseline, 0, 10, suggested=True)
    else:
        add(baseline, 1, 10, side="SELL", suggested=True)
    request = RepairRequest(baseline=baseline)
    validate(request, repair_orders(request))


def test_price_rejected_order_not_repaired_or_removed():
    baseline = case()
    add(baseline, 0, 60, limit=-100)
    assert repair_orders(RepairRequest(baseline=baseline)).status == "unchanged"


def test_stale_permissions_and_unauthorized_changes_rejected():
    baseline = case()
    order = add(baseline, 0, 60)
    request = RepairRequest(baseline=baseline, allow_revision_ids=[order.client_order_id])
    result = repair_orders(request)
    with pytest.raises(ValueError, match="permissions changed"):
        validate_repair(
            RepairCheck(
                baseline=baseline, input_hash=result.input_hash, proposed_orders=result.orders
            )
        )
    altered = result.orders[0].model_copy(update={"side": "SELL"})
    with pytest.raises(ValueError, match="only reduce"):
        validate_repair(
            RepairCheck(
                **request.model_dump(), input_hash=result.input_hash, proposed_orders=[altered]
            )
        )


def test_keep_original_and_no_additions_can_block_repair():
    baseline = case()
    o = add(baseline, 0, 60, suggested=True)
    request = RepairRequest(
        baseline=baseline, keep_original_ids=[o.client_order_id], allow_additions=False
    )
    assert repair_orders(request).status == "blocked"


def test_multiple_orders_not_merged():
    baseline = case()
    a = add(baseline, 0, 35)
    b = add(baseline, 0, 25, suggested=True)
    request = RepairRequest(baseline=baseline)
    result = repair_orders(request)
    validate(request, result)
    assert next(o for o in result.orders if o.client_order_id == a.client_order_id) == a
    assert any(o.client_order_id == b.client_order_id for o in result.orders)


@pytest.mark.parametrize("status", ["timeout", "error"])
def test_solver_failures_not_claimed_infeasible(monkeypatch, status):
    monkeypatch.setattr(
        "backend.services.order_repair_service.optimize_repair", lambda *_: (status, [])
    )
    baseline = case()
    add(baseline, 0, 60)
    result = repair_orders(RepairRequest(baseline=baseline))
    assert result.status == status and not result.orders


@pytest.mark.parametrize("date", ["2026-03-29", "2026-10-25"])
@pytest.mark.parametrize("minutes", [15, 60])
def test_repair_uses_dst_delivery_grid(date, minutes):
    baseline = case(minutes)
    baseline.delivery_date = date
    add(baseline, 0, 60, suggested=True)
    request = RepairRequest(baseline=baseline)
    validate(request, repair_orders(request))


def test_final_validation_rejects_duplicates_and_unrepaired_portfolio():
    baseline = case()
    old = add(baseline, 0, 60, suggested=True)
    request = RepairRequest(baseline=baseline)
    result = repair_orders(request)
    with pytest.raises(ValueError, match="unique"):
        validate_repair(
            RepairCheck(
                **request.model_dump(),
                input_hash=result.input_hash,
                proposed_orders=result.orders * 2,
            )
        )
    with pytest.raises(ValueError, match="blocking"):
        validate_repair(
            RepairCheck(**request.model_dump(), input_hash=result.input_hash, proposed_orders=[old])
        )


def test_invalid_inputs_fail_before_optimization():
    with pytest.raises(ValueError, match="increment"):
        baseline = case()
        add(baseline, 0, 10.01)
        RepairRequest(baseline=OrderSimulationRequest.model_validate(baseline.model_dump()))


def test_read_only_routes_validate_full_repair_and_permissions():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.api.routes.order_suggestions import router

    app = FastAPI()
    app.include_router(router)
    baseline = case()
    o = add(baseline, 0, 60)
    payload = RepairRequest(baseline=baseline, allow_revision_ids=[o.client_order_id]).model_dump(
        mode="json"
    )
    with TestClient(app) as client:
        response = client.post("/api/order-suggestions/repair", json=payload)
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "ready"
        check = {**payload, "input_hash": result["input_hash"], "proposed_orders": result["orders"]}
        assert client.post("/api/order-suggestions/repair/validate", json=check).status_code == 200
        check["allow_revision_ids"] = []
        assert client.post("/api/order-suggestions/repair/validate", json=check).status_code == 422
