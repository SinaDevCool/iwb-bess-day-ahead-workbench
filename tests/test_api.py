from fastapi.testclient import TestClient

from backend.api.main import app

client = TestClient(app)


def test_health_and_configuration():
    assert client.get("/health").status_code == 200
    config = client.get("/api/configuration").json()
    assert config["battery"]["capacity_mwh"] == 100
    assert config["battery"]["max_discharge_power_mw"] == 50


def test_forecast_rejects_unsupported_or_invalid_intervals_and_dates():
    for duration in (0, -15, 30):
        assert client.get("/api/forecast", params={"product_minutes": duration}).status_code == 422
    assert client.get("/api/forecast", params={"delivery_date": "not-a-date"}).status_code == 422


def test_product_duration_changes_dispatch_granularity_and_orders():
    hourly = client.post("/api/simulations", json={"market": {"product_minutes": 60}}).json()
    quarter_hourly = client.post("/api/simulations", json={"market": {"product_minutes": 15}}).json()

    assert hourly["market"]["product_minutes"] == 60
    assert quarter_hourly["market"]["product_minutes"] == 15
    assert len(hourly["dispatch"]) == 24
    assert len(quarter_hourly["dispatch"]) == 96
    assert len(hourly["orders"]) != len(quarter_hourly["orders"])
    assert hourly["orders"][0]["product"] == "DAY_AHEAD_60MIN"
    assert quarter_hourly["orders"][0]["product"] == "DAY_AHEAD_15MIN"
    assert hourly["orders"][0]["energy_mwh"] == hourly["orders"][0]["volume_mw"]
    assert quarter_hourly["orders"][0]["energy_mwh"] == round(
        quarter_hourly["orders"][0]["volume_mw"] / 4, 6
    )


def test_simulation_approval_and_audit():
    response = client.post("/api/simulations", json={})
    assert response.status_code == 200
    payload = response.json()
    simulation_id = payload["simulation_id"]
    assert client.post(f"/api/order-proposals/{simulation_id}/validate").status_code == 200
    approval = client.post(f"/api/order-proposals/{simulation_id}/approve")
    assert approval.status_code == 200
    assert approval.json()["submitted"] is False
    assert client.get("/api/audit").json()["items"]


def test_trader_can_adjust_and_exclude_orders_with_revalidation():
    payload = client.post("/api/simulations", json={}).json()
    first, second = payload["orders"][:2]
    response = client.patch(f"/api/order-proposals/{payload['simulation_id']}", json={"adjustments": [
        {"order_id": first["order_id"], "volume_mw": 12.3, "limit_price_eur_mwh": 44.4, "comment": "Trader liquidity view"},
        {"order_id": second["order_id"], "exclude": True, "comment": "Avoid thin product"},
    ]})
    assert response.status_code == 200
    revised = response.json()
    assert len(revised["orders"]) == len(payload["orders"]) - 1
    assert revised["orders"][0]["volume_mw"] == 12.3
    assert revised["audit"]["modified_by_trader"] is True


def test_excessive_trader_volume_fails_physical_validation_and_approval():
    payload = client.post("/api/simulations", json={}).json()
    first = payload["orders"][0]
    revised = client.patch(f"/api/order-proposals/{payload['simulation_id']}", json={"adjustments": [
        {"order_id": first["order_id"], "volume_mw": 1000, "comment": "Validation probe"}
    ]}).json()
    assert revised["validation"]["status"] == "failed"
    assert any(item["code"] == "order_power_limit" for item in revised["validation"]["findings"])
    assert client.post(f"/api/order-proposals/{payload['simulation_id']}/approve").status_code == 409


def test_out_of_range_unavailable_interval_is_rejected():
    response = client.post("/api/simulations", json={"battery": {"unavailable_intervals": [999]}})
    assert response.status_code == 422


def test_validate_recomputes_and_marks_orders_validated():
    payload = client.post("/api/simulations", json={}).json()
    response = client.post(f"/api/order-proposals/{payload['simulation_id']}/validate")
    assert response.status_code == 200
    validated = response.json()
    assert validated["validation"]["status"] == "passed"
    assert all(order["status"] == "VALIDATED" for order in validated["orders"])
    assert validated["proposal"]["proposal_terminal_soc_mwh"] >= validated["battery"]["target_soc_mwh"] - .15


def test_invalid_proposal_cannot_be_exported():
    payload = client.post("/api/simulations", json={}).json()
    first = payload["orders"][0]
    client.patch(f"/api/order-proposals/{payload['simulation_id']}", json={"adjustments": [
        {"order_id": first["order_id"], "volume_mw": 1000, "comment": "Deliberate invalid test"}
    ]})
    assert client.get(f"/api/order-proposals/{payload['simulation_id']}/export").status_code == 409


def test_post_export_records_event_but_legacy_get_is_safe():
    payload = client.post("/api/simulations", json={}).json()
    simulation_id = payload["simulation_id"]
    assert client.post(f"/api/order-proposals/{simulation_id}/approve").status_code == 200
    before = len([e for e in client.get("/api/audit").json()["items"] if e["simulation_id"] == simulation_id])
    assert client.get(f"/api/order-proposals/{simulation_id}/export").status_code == 200
    after_get = len([e for e in client.get("/api/audit").json()["items"] if e["simulation_id"] == simulation_id])
    assert after_get == before
    assert client.post(f"/api/order-proposals/{simulation_id}/exports").status_code == 200
    after_post = len([e for e in client.get("/api/audit").json()["items"] if e["simulation_id"] == simulation_id])
    assert after_post == before + 1


def test_trader_edit_requires_reason_and_real_change():
    payload = client.post("/api/simulations", json={}).json()
    first = payload["orders"][0]
    assert client.patch(f"/api/order-proposals/{payload['simulation_id']}", json={"adjustments": [
        {"order_id": first["order_id"], "limit_price_eur_mwh": 31, "comment": ""}
    ]}).status_code == 422
    assert client.patch(f"/api/order-proposals/{payload['simulation_id']}", json={"adjustments": [
        {"order_id": first["order_id"], "comment": "No actual change"}
    ]}).status_code == 422
    assert client.patch(f"/api/order-proposals/{payload['simulation_id']}", json={"adjustments": [
        {"order_id": first["order_id"], "volume_mw": first["volume_mw"], "limit_price_eur_mwh": first["limit_price_eur_mwh"], "comment": "Same submitted values"}
    ]}).status_code == 422


def test_export_requires_current_proposal_approval_and_edit_revokes_it():
    payload = client.post("/api/simulations", json={}).json()
    simulation_id = payload["simulation_id"]
    assert client.post(f"/api/order-proposals/{simulation_id}/exports").status_code == 409
    assert client.post(f"/api/order-proposals/{simulation_id}/approve").status_code == 200
    assert client.post(f"/api/order-proposals/{simulation_id}/exports").status_code == 200
    first = payload["orders"][0]
    edited = client.patch(f"/api/order-proposals/{simulation_id}", json={"adjustments": [
        {"order_id": first["order_id"], "volume_mw": first["volume_mw"] / 2, "comment": "Reduce market exposure"}
    ]}).json()
    assert edited["proposal_revision"] == 2
    assert edited.get("approval_status") is None
    assert len(edited["proposal"]["implied_dispatch"]) == len(edited["dispatch"])
    assert abs(edited["proposal"]["implied_dispatch"][-1]["soc_mwh"] - edited["proposal"]["proposal_terminal_soc_mwh"]) < 0.001
    assert client.post(f"/api/order-proposals/{simulation_id}/exports").status_code == 409


def test_approval_is_idempotent():
    payload = client.post("/api/simulations", json={}).json()
    first = client.post(f"/api/order-proposals/{payload['simulation_id']}/approve")
    second = client.post(f"/api/order-proposals/{payload['simulation_id']}/approve")
    assert first.status_code == second.status_code == 200
    assert second.json()["already_approved"] is True


def test_initial_result_versions_and_proposal_metrics_are_present():
    payload = client.post("/api/simulations", json={}).json()
    assert payload["audit"]["schema_version"] == 3
    assert payload["audit"]["assumption_sources"]["market.exchange_fee"] == "Excluded; IWB confirmation required"
    assert payload["audit"]["validation_version"] == "physical_and_order_validation_v3"
    assert payload["optimization"]["engine"] == "scipy_highs_milp_v1"
    assert payload["summary"]["baseline_proposal_contribution_eur"] == payload["summary"]["proposal_contribution_eur"]


def test_saved_run_catalogue_is_compact_and_filterable():
    hourly = client.post(
        "/api/simulations",
        json={"scenario_name": "Expected forecast", "market": {"product_minutes": 60}},
    ).json()
    quarter_hourly = client.post(
        "/api/simulations",
        json={"scenario_name": "Downside", "market": {"product_minutes": 15}},
    ).json()

    response = client.get("/api/simulation-runs", params={"limit": 100})
    assert response.status_code == 200
    items = response.json()["items"]
    assert {hourly["simulation_id"], quarter_hourly["simulation_id"]} <= {
        item["simulation_id"] for item in items
    }
    summary = next(item for item in items if item["simulation_id"] == quarter_hourly["simulation_id"])
    assert "dispatch" not in summary
    assert "orders" not in summary
    assert summary["product_minutes"] == 15
    assert summary["expected_contribution_eur"] == quarter_hourly["summary"]["expected_contribution_eur"]
    assert summary["downside_contribution_eur"] == quarter_hourly["risk"]["downside_contribution_eur"]
    assert summary["input_hash"] == quarter_hourly["audit"]["input_hash"]

    filtered = client.get(
        "/api/simulation-runs",
        params={"product_minutes": 15, "validation_status": "passed", "scenario": "down"},
    )
    assert filtered.status_code == 200
    assert filtered.json()["items"]
    assert all(item["product_minutes"] == 15 for item in filtered.json()["items"])
    assert all("down" in item["scenario_name"].lower() for item in filtered.json()["items"])


def test_saved_run_catalogue_rejects_invalid_filters():
    assert client.get("/api/simulation-runs", params={"limit": 0}).status_code == 422
    assert client.get("/api/simulation-runs", params={"limit": 101}).status_code == 422
    assert client.get("/api/simulation-runs", params={"product_minutes": 30}).status_code == 422
    assert client.get("/api/simulation-runs", params={"validation_status": "unknown"}).status_code == 422
