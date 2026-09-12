from fastapi.testclient import TestClient

from backend.api.main import app
from backend.config.defaults import DEFAULT_BATTERY, DEFAULT_MARKET
from backend.domain.models import OrderSimulationRequest, SubmittedOrder
from backend.services.forecast_service import build_demo_forecast
from backend.services.order_simulation_service import run_order_simulation


def request_with(orders, prices=None, battery=None):
    market = DEFAULT_MARKET.model_copy(update={"product_minutes": 60})
    points = build_demo_forecast("2026-09-09", market)
    return OrderSimulationRequest(
        delivery_date="2026-09-09",
        market=market,
        battery=battery or DEFAULT_BATTERY,
        prices=points,
        forecast={"source_type": "manual", "source_name": "Test forecast", "version": "test-v1", "bidding_zone": "CH"},
        orders=[SubmittedOrder(delivery_start_utc=points[index].timestamp_utc, **values) for index, values in orders],
    ).model_copy(update={"price_values": prices}) if prices is not None else OrderSimulationRequest(
        delivery_date="2026-09-09", market=market, battery=battery or DEFAULT_BATTERY, prices=points,
        forecast={"source_type": "manual", "source_name": "Test forecast", "version": "test-v1", "bidding_zone": "CH"},
        orders=[SubmittedOrder(delivery_start_utc=points[index].timestamp_utc, **values) for index, values in orders],
    )


def order(order_id, side, kind, volume, limit=None):
    return {"client_order_id": order_id, "side": side, "order_type": kind, "volume_mw": volume, "limit_price_eur_mwh": limit}


def test_market_and_limit_execution_changes_soc_sequentially(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([
        (5, order("buy-market", "BUY", "MARKET", 40)),
        (10, order("sell-limit", "SELL", "LIMIT", 30, 80)),
    ]))
    assert [item.execution_status.value for item in result.order_results] == ["EXECUTED", "EXECUTED"]
    assert result.order_results[1].soc_before_mwh == result.order_results[0].soc_after_mwh
    assert result.summary.executed_order_count == 2
    assert len(result.dispatch) == 24


def test_limit_conditions_are_side_specific(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([
        (5, order("buy-reject", "BUY", "LIMIT", 10, 30)),   # forecast 35
        (10, order("sell-reject", "SELL", "LIMIT", 10, 90)), # forecast 82
        (14, order("buy-equal", "BUY", "LIMIT", 10, 48)),
        (18, order("sell-equal", "SELL", "LIMIT", 10, 120)),
    ]))
    statuses = {item.submitted_order.client_order_id: item.execution_status.value for item in result.order_results}
    assert statuses == {"buy-reject": "NOT_EXECUTED", "sell-reject": "NOT_EXECUTED", "buy-equal": "EXECUTED", "sell-equal": "EXECUTED"}


def test_infeasible_order_is_not_silently_reduced(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([(5, order("too-large", "BUY", "MARKET", 80))]))
    outcome = result.order_results[0]
    assert outcome.execution_status.value == "PHYSICALLY_INFEASIBLE"
    assert outcome.executed_volume_mw == 0
    assert result.summary.final_soc_mwh == DEFAULT_BATTERY.initial_soc_mwh


def test_conflicting_sides_are_reported(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([
        (5, order("buy", "BUY", "MARKET", 10)),
        (5, order("sell", "SELL", "MARKET", 10)),
    ]))
    assert result.summary.infeasible_order_count == 2
    assert result.validation.status == "failed"
    assert all(item.reason_code == "CONFLICTING_SIDES" for item in result.order_results)


def test_market_and_limit_contract_validation():
    try:
        SubmittedOrder(client_order_id="bad", delivery_start_utc="2026-09-08T22:00:00Z", side="BUY", order_type="LIMIT", volume_mw=10)
    except ValueError as error:
        assert "limit price" in str(error).lower()
    else:
        raise AssertionError("Limit order without price should fail")


def test_order_simulation_api(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    request = request_with([(5, order("market-buy", "BUY", "MARKET", 20))])
    response = TestClient(app).post("/api/order-simulations", json=request.model_dump(mode="json"))
    assert response.status_code == 200
    body = response.json()
    assert body["run_type"] == "ORDER_SIMULATION"
    assert body["summary"]["submitted_order_count"] == 1
    fetched = TestClient(app).get(f"/api/order-simulations/{body['simulation_id']}")
    assert fetched.status_code == 200
