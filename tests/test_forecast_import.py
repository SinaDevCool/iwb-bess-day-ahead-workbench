import pytest


@pytest.mark.parametrize(
    "day,minutes,count",
    [
        ("2026-09-09", 60, 24),
        ("2026-09-09", 15, 96),
        ("2026-03-29", 60, 23),
        ("2026-10-25", 60, 25),
        ("2026-03-29", 15, 92),
        ("2026-10-25", 15, 100),
    ],
)
def test_real_csv_upload_to_simulation(day, minutes, count, client):
    points = client.get(f"/api/forecast?delivery_date={day}&product_minutes={minutes}").json()[
        "points"
    ]
    csv = "delivery_start,price_eur_mwh\n" + "\n".join(
        f"{p['timestamp_utc']},{-20 if i == 0 else p['price_eur_mwh']}"
        for i, p in enumerate(points)
    )
    response = client.post(
        f"/api/forecast/import?delivery_date={day}&product_minutes={minutes}",
        content=csv,
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert len(preview["points"]) == count
    assert preview["points"][0]["price_eur_mwh"] == -20
    run = client.post(
        "/api/order-simulations",
        json={
            "delivery_date": day,
            "market": {"product_minutes": minutes},
            "prices": preview["points"],
            "forecast": preview["forecast"],
            "orders": [],
        },
    )
    assert run.status_code == 200, run.text
    assert run.json()["forecast"]["content_hash"] == preview["forecast"]["content_hash"]
    assert run.json()["dispatch"][0]["price_eur_mwh"] == -20


@pytest.mark.parametrize(
    "body",
    [
        "wrong,header\n1,2",
        "delivery_start,price_eur_mwh\n2026-09-09T00:00:00Z,",
        "delivery_start,price_eur_mwh\n2026-09-09T00:00:00Z,NaN",
        "delivery_start,price_eur_mwh\n",
    ],
)
def test_invalid_csv(body, client):
    assert (
        client.post("/api/forecast/import?delivery_date=2026-09-09", content=body).status_code
        == 422
    )


def test_upload_is_bounded_and_providers_honest(client):
    assert (
        client.post(
            "/api/forecast/import?delivery_date=2026-09-09", content="x" * 256001
        ).status_code
        == 413
    )
    providers = client.get("/api/forecast/providers").json()["items"]
    assert [p["id"] for p in providers if p["connected"]] == ["demo"]


def test_manual_validation_preserves_negative_prices_and_rejects_missing_intervals(client):
    points = client.get("/api/forecast?delivery_date=2026-09-09&product_minutes=60").json()[
        "points"
    ]
    points[0]["price_eur_mwh"] = -50
    response = client.post(
        "/api/forecast/validate", json={"delivery_date": "2026-09-09", "prices": points}
    )
    assert response.status_code == 200
    assert response.json()["points"][0]["price_eur_mwh"] == -50
    assert len(response.json()["content_hash"]) == 64
    assert (
        client.post(
            "/api/forecast/validate", json={"delivery_date": "2026-09-09", "prices": points[:-1]}
        ).status_code
        == 422
    )


def test_malformed_csv_is_a_validation_error_not_server_error(client):
    body = 'delivery_start,price_eur_mwh\n"unterminated'
    assert (
        client.post("/api/forecast/import?delivery_date=2026-09-09", content=body).status_code
        == 422
    )


def test_wrong_resolution_error_is_actionable_without_framework_details(client):
    points = client.get("/api/forecast?delivery_date=2026-09-09&product_minutes=60").json()[
        "points"
    ]
    body = "delivery_start,price_eur_mwh\n" + "\n".join(
        f"{p['timestamp_utc']},{p['price_eur_mwh']}" for p in points
    )
    response = client.post(
        "/api/forecast/import?delivery_date=2026-09-09&product_minutes=15", content=body
    )
    assert response.status_code == 422
    message = response.json()["detail"]
    assert "96 delivery intervals" in message
    assert "template" in message
    assert "input_value" not in message
    assert "pydantic" not in message
