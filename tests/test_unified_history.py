def test_history_returns_order_run_and_scoped_events(client):
    run = client.post("/api/order-simulations", json={"orders": []}).json()
    detail = client.get("/api/workspace-history/" + run["simulation_id"]).json()
    assert detail["run"]["simulation_id"] == run["simulation_id"]
    assert detail["events"]
    assert all(e["simulation_id"] == run["simulation_id"] for e in detail["events"])
    assert (
        client.get("/api/workspace-history?limit=1").json()["items"][0]["simulation_id"]
        == run["simulation_id"]
    )
    assert client.get("/api/workspace-history?offset=-1").status_code == 422
    assert client.get("/api/workspace-history/absent").status_code == 404


def test_import_metadata_cannot_silently_fall_back_to_demo(client):
    assert (
        client.post(
            "/api/order-simulations", json={"forecast": {"source_type": "file"}}
        ).status_code
        == 422
    )
