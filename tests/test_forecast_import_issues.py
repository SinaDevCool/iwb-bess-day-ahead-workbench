"""The generated CSV contract must be uploadable; blank remains different from zero."""

import pytest


@pytest.mark.parametrize(
    "day,minutes", [("2026-09-09", 60), ("2026-09-09", 15), ("2026-03-29", 15), ("2026-10-25", 15)]
)
def test_template_round_trip_and_blank_summary(day, minutes, client):
    points = client.get(f"/api/forecast?delivery_date={day}&product_minutes={minutes}").json()[
        "points"
    ]
    endpoint = f"/api/forecast/import?delivery_date={day}&product_minutes={minutes}"
    header = "delivery_start,price_eur_mwh\r\n"
    blank = header + "\r\n".join(f"{p['timestamp_utc']}," for p in points) + "\r\n"
    error = client.post(endpoint, content=blank).json()
    assert "prices are missing" in error["detail"]
    assert len(error["detail"]) < 150
    assert len(error["issues"]) == len(points)
    assert error["issues"][0]["code"] == "missing_price"
    filled = (
        header + "\r\n".join(f"{p['timestamp_utc']},{p['price_eur_mwh']}" for p in points) + "\r\n"
    )
    response = client.post(endpoint, content=(filled + "\r\n").encode("utf-8-sig"))
    assert response.status_code == 200, response.text
    assert len(response.json()["points"]) == len(points)


def test_row_issues_distinguish_duplicates_numbers_and_timestamps(client):
    body = "delivery_start,price_eur_mwh\n2026-09-08T22:00:00Z,0\n2026-09-08T22:00:00Z,-5\nwrong,5\n2026-09-08T23:00:00Z,NaN\n"
    response = client.post("/api/forecast/import?delivery_date=2026-09-09", content=body)
    assert response.status_code == 422
    issues = response.json()["issues"]
    assert {i["code"] for i in issues} == {
        "duplicate_interval",
        "invalid_timestamp",
        "invalid_price",
    }
    assert [i["row"] for i in issues] == [3, 4, 5]
