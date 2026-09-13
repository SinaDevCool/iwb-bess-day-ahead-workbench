from backend.domain.models import MarketConfig
from backend.services.forecast_service import build_demo_forecast


def test_spring_dst_has_23_hourly_products():
    assert len(build_demo_forecast("2026-03-29", MarketConfig(product_minutes=60))) == 23


def test_autumn_dst_has_25_hourly_products():
    points = build_demo_forecast("2026-10-25", MarketConfig(product_minutes=60))
    assert len(points) == 25
    assert len({point.timestamp_utc for point in points}) == 25


def test_quarter_hour_normal_day_has_96_products():
    assert len(build_demo_forecast("2026-09-09", MarketConfig(product_minutes=15))) == 96
