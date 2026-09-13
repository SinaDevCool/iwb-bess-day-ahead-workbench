"""Date selection returns time slots, not an implicitly selected forecast."""

import pytest


@pytest.mark.parametrize("date,hours", [("2026-09-09", 24), ("2026-03-29", 23), ("2026-10-25", 25)])
@pytest.mark.parametrize("minutes", [15, 60])
def test_grid_has_unique_dst_aware_slots_without_prices(client, date, hours, minutes):
    response = client.get(
        "/api/delivery-grid", params={"delivery_date": date, "product_minutes": minutes}
    )
    assert response.status_code == 200
    points = response.json()["points"]
    assert len(points) == hours * 60 // minutes
    assert len({point["timestamp_utc"] for point in points}) == len(points)
    assert all(set(point) == {"timestamp_utc"} for point in points)


@pytest.mark.parametrize(
    "params", [{"delivery_date": "invalid"}, {"delivery_date": "2026-09-09", "product_minutes": 30}]
)
def test_invalid_grid_is_rejected(client, params):
    assert client.get("/api/delivery-grid", params=params).status_code == 422
