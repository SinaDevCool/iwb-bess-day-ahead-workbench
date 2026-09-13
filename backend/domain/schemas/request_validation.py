"""Shared input validation, independent of either optimizer or simulation request."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.domain.delivery_grid import delivery_grid


def validate_forecast_inputs(delivery_date, battery, market, prices, price_values, forecast):
    try:
        datetime.strptime(delivery_date, "%Y-%m-%d")
    except ValueError as error:
        raise ValueError("Delivery date must use YYYY-MM-DD") from error
    if len(battery.unavailable_intervals) != len(set(battery.unavailable_intervals)):
        raise ValueError("Unavailable intervals must be unique")
    local_zone = ZoneInfo(market.timezone)
    local_date = datetime.strptime(delivery_date, "%Y-%m-%d").date()
    start = datetime.combine(local_date, time.min, tzinfo=local_zone).astimezone(timezone.utc)
    end = datetime.combine(local_date + timedelta(days=1), time.min, tzinfo=local_zone).astimezone(
        timezone.utc
    )
    interval_count = int((end - start).total_seconds() / 60 / market.product_minutes)
    if any(index < 0 or index >= interval_count for index in battery.unavailable_intervals):
        raise ValueError(
            f"Unavailable intervals must be between 0 and {interval_count - 1} for this delivery day"
        )
    if prices is not None and price_values is not None:
        raise ValueError(
            "Provide either timestamped forecast points or a manual price series, not both"
        )
    if forecast.source_type != "illustrative" and prices is None and price_values is None:
        raise ValueError("A manual or imported forecast source requires forecast prices")
    if forecast.bidding_zone != market.bidding_zone:
        raise ValueError("Forecast bidding zone must match the configured market")
    if prices is not None:
        timestamps = [point.timestamp_utc for point in prices]
        if any(t.tzinfo is None or t.utcoffset() is None for t in timestamps):
            raise ValueError("Forecast timestamps must include a timezone")
        if timestamps != sorted(timestamps) or len(timestamps) != len(set(timestamps)):
            raise ValueError("Forecast timestamps must be unique and chronological")
        if any(
            not market.min_price_eur_mwh <= point.price_eur_mwh <= market.max_price_eur_mwh
            for point in prices
        ):
            raise ValueError("Forecast price is outside configured market limits")
        if len(prices) != interval_count:
            raise ValueError(f"Forecast must contain exactly {interval_count} delivery intervals")
        if any(point.timestamp_utc < start or point.timestamp_utc >= end for point in prices):
            raise ValueError(
                "Forecast timestamps must cover only the configured local delivery day"
            )
        if timestamps != delivery_grid(delivery_date, market.timezone, market.product_minutes):
            raise ValueError("Forecast timestamps must match the exact delivery grid")
    if price_values is not None:
        if len(price_values) != interval_count:
            raise ValueError(f"Manual forecast must contain exactly {interval_count} prices")
        if any(
            not market.min_price_eur_mwh <= value <= market.max_price_eur_mwh
            for value in price_values
        ):
            raise ValueError("Manual forecast price is outside configured market limits")
    return start, end
