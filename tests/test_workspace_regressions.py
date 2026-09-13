from datetime import timedelta

import pytest

from backend.domain.models import OrderSimulationRequest, SubmittedOrder
from backend.config.defaults import DEFAULT_MARKET
from backend.services.forecast_service import build_demo_forecast
from backend.services.order_simulation_service import run_order_simulation


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "audit.sqlite")


def request(orders=(), shift=0):
    points = build_demo_forecast("2026-09-09", DEFAULT_MARKET)
    return OrderSimulationRequest(prices=[p.model_copy(update={"timestamp_utc": p.timestamp_utc + timedelta(minutes=shift)}) for p in points], orders=[SubmittedOrder(client_order_id=str(i), delivery_start_utc=points[5].timestamp_utc, **o) for i, o in enumerate(orders)])


def test_off_grid_forecast_is_rejected():
    with pytest.raises(ValueError, match="grid"):
        request(shift=1)


def test_naive_forecast_is_validation_error():
    points = build_demo_forecast("2026-09-09", DEFAULT_MARKET)
    with pytest.raises(ValueError, match="timezone"):
        OrderSimulationRequest(prices=[p.model_copy(update={"timestamp_utc": p.timestamp_utc.replace(tzinfo=None)}) for p in points])


def test_batch_evidence_is_explicit():
    result = run_order_simulation(request([dict(side="BUY", order_type="MARKET", volume_mw=5)] * 2))
    assert len(result.order_results) == 2
    for item in result.order_results:
        assert item.soc_evidence_scope == "delivery_interval"
        assert item.interval_order_count == 2
    assert sum(x.soc_delta_mwh for x in result.order_results) == pytest.approx(result.dispatch[5].soc_mwh - 50, abs=2e-6)


def test_terminal_failure_is_portfolio_failure():
    result = run_order_simulation(request([dict(side="SELL", order_type="MARKET", volume_mw=10)]))
    assert not result.submitted_portfolio_feasible
    assert not result.executed_schedule_feasible


def test_infeasible_buy_preserves_price_evidence():
    result = run_order_simulation(request([dict(side="BUY", order_type="LIMIT", volume_mw=80, limit_price_eur_mwh=40)]))
    item = result.order_results[0]
    assert item.price_condition_passed is True
    assert item.price_condition_operator == "<="
    assert item.price_margin_eur_mwh == 5


def test_each_order_has_one_outcome():
    result = run_order_simulation(request([dict(side="BUY", order_type="LIMIT", volume_mw=5, limit_price_eur_mwh=1), dict(side="BUY", order_type="MARKET", volume_mw=5)]))
    assert {o.client_order_id for o in result.submitted_orders} == {o.submitted_order.client_order_id for o in result.order_results}


def test_economic_components_reconcile():
    result = run_order_simulation(request([dict(side="BUY", order_type="MARKET", volume_mw=5.1)]*3))
    s = result.summary
    assert s.net_contribution_eur == round(s.sales_revenue_eur-s.purchase_cost_eur-s.degradation_cost_eur-s.transaction_fee_eur, 2)
    row=result.dispatch[5]
    assert row.interval_pnl_eur == round(row.sales_revenue_eur-row.purchase_cost_eur-row.degradation_cost_eur-row.transaction_fee_eur,2)
    assert s.net_contribution_eur == row.interval_pnl_eur


def test_run_type_filter_applies_before_limit():
    from backend.db.repository import save_simulation_with_event,list_simulations
    for index in range(36):
        payload={"simulation_id":str(index),"created_at_utc":f"2026-09-09T00:00:{index:02d}Z","run_type":"OPTIMIZATION" if index<2 else "ORDER_SIMULATION"}
        save_simulation_with_event(payload,payload["created_at_utc"],"TEST",{})
    assert len(list_simulations(2,run_type="OPTIMIZATION"))==2


def test_proposal_adapter_roundtrip_and_type_guards():
    from fastapi.testclient import TestClient
    from backend.api.main import app
    client = TestClient(app)
    preview = client.post("/api/proposal-preview", json={"risk_posture": "expected_value"})
    assert preview.status_code == 200, preview.text
    p = preview.json()
    assert p["proposal"]["sensitivities"] == []
    result = client.post("/api/order-simulations", json={
        "delivery_date": p["proposal"]["delivery_date"], "battery": p["proposal"]["battery"],
        "market": p["proposal"]["market"], "price_values": [x["price_eur_mwh"] for x in p["proposal"]["forecast_points"]],
        "orders": p["orders"], "source_proposal_id": p["proposal"]["simulation_id"],
    })
    assert result.status_code == 200, result.text
    r = result.json()
    assert r["summary"]["executed_order_count"] == len(p["orders"])
    assert r["executed_schedule_feasible"]
    assert r["summary"]["net_contribution_eur"] == pytest.approx(p["proposal"]["summary"]["expected_contribution_eur"], abs=.1)
    assert r["audit"]["source_proposal_id"] == p["proposal"]["simulation_id"]
    assert client.post(f"/api/order-proposals/{r['simulation_id']}/approve").status_code == 409
    history = client.get("/api/workspace-history").json()["items"]
    assert {x["run_type"] for x in history} == {"ORDER_SIMULATION", "OPTIMIZATION"}
    assert all(x["display_name"] for x in history)
    assert next(x for x in history if x["simulation_id"] == p["proposal"]["simulation_id"])["display_name"] == p["proposal"]["display_name"]
    before_ids = {x["simulation_id"] for x in history}
    sensitivities = client.post(f"/api/simulations/{p['proposal']['simulation_id']}/sensitivities")
    assert sensitivities.status_code == 200, sensitivities.text
    assert len(sensitivities.json()["items"]) >= 5
    assert {x["simulation_id"] for x in client.get("/api/workspace-history").json()["items"]} == before_ids


@pytest.mark.parametrize("day,minutes,count", [("2026-03-29",60,23),("2026-10-25",60,25),("2026-03-29",15,92),("2026-10-25",15,100)])
def test_exact_dst_grid(day,minutes,count):
    market = DEFAULT_MARKET.model_copy(update={"product_minutes": minutes})
    points = build_demo_forecast(day,market)
    assert len(points) == count
    req = OrderSimulationRequest(delivery_date=day,market=market,prices=points)
    result = run_order_simulation(req)
    assert len(result.dispatch) == count
    assert result.executed_schedule_feasible
