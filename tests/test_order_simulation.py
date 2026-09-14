import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.config.defaults import DEFAULT_BATTERY, DEFAULT_MARKET
from backend.domain.models import OrderSimulationRequest, SubmittedOrder
from backend.services.forecast_service import build_demo_forecast
from backend.services.order_simulation_service import run_order_simulation


def test_homework_acceptance_csv_reject_correct_and_restore(client):
    """Runbook journey through existing import/simulation APIs, isolated by conftest."""
    preview = client.post(
        "/api/forecast/import?delivery_date=2026-09-09&product_minutes=60",
        content=(Path(__file__).parent / "fixtures/da-forecast-2026-09-09.csv").read_bytes(),
        headers={"Content-Type": "text/csv"},
    )
    assert preview.status_code == 200
    data = preview.json()
    orders = [
        {
            **order("accept-buy-market", "BUY", "MARKET", 20),
            "delivery_start_utc": data["points"][5]["timestamp_utc"],
        },
        {
            **order("accept-buy-limit", "BUY", "LIMIT", 20, 40),
            "delivery_start_utc": data["points"][6]["timestamp_utc"],
        },
        {
            **order("accept-sell-limit", "SELL", "LIMIT", 15, 130),
            "delivery_start_utc": data["points"][18]["timestamp_utc"],
        },
    ]

    def simulate():
        response = client.post(
            "/api/order-simulations",
            json={
                "delivery_date": "2026-09-09",
                "market": {"product_minutes": 60},
                "prices": data["points"],
                "forecast": data["forecast"],
                "orders": orders,
            },
        )
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["summary"]["net_contribution_eur"] == pytest.approx(
            sum(row["interval_pnl_eur"] for row in result["dispatch"]), abs=0.001
        )
        assert result["summary"]["final_soc_mwh"] == pytest.approx(
            result["dispatch"][-1]["soc_mwh"], abs=0.001
        )
        assert [
            {key: saved[key] for key in entered}
            for saved, entered in zip(result["submitted_orders"], orders)
        ] == orders
        return result

    initial = simulate()
    assert initial["summary"]["net_contribution_eur"] == -1454.44
    assert initial["summary"]["executed_order_count"] == 2
    assert initial["summary"]["not_executed_order_count"] == 1
    assert initial["summary"]["infeasible_order_count"] == 0
    orders[2]["limit_price_eur_mwh"] = 110
    corrected = simulate()
    assert corrected["summary"]["net_contribution_eur"] == 297.91
    assert corrected["summary"]["final_soc_mwh"] == 72.136
    assert corrected["summary"]["throughput_mwh"] == 53.759
    assert corrected["summary"]["executed_order_count"] == 3
    assert corrected["submitted_portfolio_feasible"]
    orders[0]["volume_mw"] = 60
    constrained = simulate()
    assert constrained["summary"]["net_contribution_eur"] == 1055.13
    assert constrained["summary"]["infeasible_order_count"] == 1
    assert not constrained["submitted_portfolio_feasible"]
    orders[0]["volume_mw"] = 20
    restored = simulate()
    assert restored["summary"] == corrected["summary"]
    for name, result in [
        ("initial", initial),
        ("corrected", corrected),
        ("constrained", constrained),
        ("restored", restored),
    ]:
        print(name, result["summary"])


def request_with(orders, prices=None, battery=None):
    market = DEFAULT_MARKET.model_copy(update={"product_minutes": 60})
    points = build_demo_forecast("2026-09-09", market)
    return (
        OrderSimulationRequest(
            delivery_date="2026-09-09",
            market=market,
            battery=battery or DEFAULT_BATTERY,
            prices=points,
            forecast={
                "source_type": "manual",
                "source_name": "Test forecast",
                "version": "test-v1",
                "bidding_zone": "CH",
            },
            orders=[
                SubmittedOrder(delivery_start_utc=points[index].timestamp_utc, **values)
                for index, values in orders
            ],
        ).model_copy(update={"price_values": prices})
        if prices is not None
        else OrderSimulationRequest(
            delivery_date="2026-09-09",
            market=market,
            battery=battery or DEFAULT_BATTERY,
            prices=points,
            forecast={
                "source_type": "manual",
                "source_name": "Test forecast",
                "version": "test-v1",
                "bidding_zone": "CH",
            },
            orders=[
                SubmittedOrder(delivery_start_utc=points[index].timestamp_utc, **values)
                for index, values in orders
            ],
        )
    )


def order(order_id, side, kind, volume, limit=None):
    return {
        "client_order_id": order_id,
        "side": side,
        "order_type": kind,
        "volume_mw": volume,
        "limit_price_eur_mwh": limit,
    }


def test_forecast_application_time_survives_simulation(tmp_path, monkeypatch):
    from datetime import datetime, timezone

    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "provenance.sqlite")
    request = request_with([])
    applied = datetime(2026, 9, 8, 10, tzinfo=timezone.utc)
    request.forecast.updated_at_utc = applied
    result = run_order_simulation(request)
    assert result.forecast.updated_at_utc == applied
    assert result.forecast.issued_at_utc is None
    assert result.forecast.content_hash
    assert len(result.dispatch) == 24
    assert all(row.power_mw == 0 for row in result.dispatch)


def test_market_and_limit_execution_changes_soc_sequentially(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(
        request_with(
            [
                (5, order("buy-market", "BUY", "MARKET", 40)),
                (10, order("sell-limit", "SELL", "LIMIT", 30, 80)),
            ]
        )
    )
    assert [item.execution_status.value for item in result.order_results] == [
        "EXECUTED",
        "EXECUTED",
    ]
    assert result.order_results[1].soc_before_mwh == result.order_results[0].soc_after_mwh
    assert result.summary.executed_order_count == 2
    assert len(result.dispatch) == 24


def test_limit_conditions_are_side_specific(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(
        request_with(
            [
                (5, order("buy-reject", "BUY", "LIMIT", 10, 30)),  # forecast 35
                (10, order("sell-reject", "SELL", "LIMIT", 10, 90)),  # forecast 82
                (14, order("buy-equal", "BUY", "LIMIT", 10, 48)),
                (18, order("sell-equal", "SELL", "LIMIT", 10, 120)),
            ]
        )
    )
    statuses = {
        item.submitted_order.client_order_id: item.execution_status.value
        for item in result.order_results
    }
    assert statuses == {
        "buy-reject": "NOT_EXECUTED",
        "sell-reject": "NOT_EXECUTED",
        "buy-equal": "EXECUTED",
        "sell-equal": "EXECUTED",
    }
    outcomes = {item.submitted_order.client_order_id: item for item in result.order_results}
    assert outcomes["buy-reject"].price_condition_operator == "<="
    assert outcomes["buy-reject"].price_margin_eur_mwh == -5
    assert outcomes["sell-reject"].price_condition_operator == ">="
    assert outcomes["sell-reject"].price_margin_eur_mwh == -8
    assert outcomes["buy-equal"].price_condition_passed is True
    assert outcomes["buy-equal"].price_margin_eur_mwh == 0


def test_infeasible_order_is_not_silently_reduced(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([(5, order("too-large", "BUY", "MARKET", 80))]))
    outcome = result.order_results[0]
    assert outcome.execution_status.value == "PHYSICALLY_INFEASIBLE"
    assert outcome.executed_volume_mw == 0
    assert result.summary.final_soc_mwh == DEFAULT_BATTERY.initial_soc_mwh
    assert result.submitted_portfolio_feasible is False
    assert result.executed_schedule_feasible is True


def test_execution_evidence_matches_energy_and_soc_math(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([(5, order("buy", "BUY", "MARKET", 10))]))
    outcome = result.order_results[0]
    assert outcome.price_condition_operator is None
    assert outcome.price_margin_eur_mwh is None
    assert outcome.price_condition_passed is True
    assert outcome.executed_energy_mwh == 10
    assert outcome.soc_delta_mwh > 0
    assert outcome.soc_after_mwh == pytest.approx(
        outcome.soc_before_mwh + outcome.soc_delta_mwh, abs=1e-6
    )
    assert result.summary.net_contribution_eur == outcome.contribution_eur


def test_price_rejection_does_not_change_soc_or_contribution(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([(5, order("rejected", "BUY", "LIMIT", 10, 1))]))
    outcome = result.order_results[0]
    assert outcome.soc_after_mwh == outcome.soc_before_mwh
    assert outcome.executed_energy_mwh == 0
    assert result.summary.net_contribution_eur == 0


def test_conflicting_sides_are_reported(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(
        request_with(
            [
                (5, order("buy", "BUY", "MARKET", 10)),
                (5, order("sell", "SELL", "MARKET", 10)),
            ]
        )
    )
    assert result.summary.infeasible_order_count == 2
    assert result.validation.status == "failed"
    assert all(item.reason_code == "CONFLICTING_SIDES" for item in result.order_results)
    assert all("does not net opposing trades" in item.reason for item in result.order_results)


def test_market_and_limit_contract_validation():
    try:
        SubmittedOrder(
            client_order_id="bad",
            delivery_start_utc="2026-09-08T22:00:00Z",
            side="BUY",
            order_type="LIMIT",
            volume_mw=10,
        )
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
