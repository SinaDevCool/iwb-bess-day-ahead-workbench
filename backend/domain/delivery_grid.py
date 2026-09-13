"""Canonical UTC delivery boundaries, including 23/25-hour local days."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def delivery_grid(delivery_date: str, timezone_name: str, product_minutes: int):
    if product_minutes not in (15, 60):
        raise ValueError("Product duration must be 15 or 60 minutes")
    try:
        start_local = datetime.strptime(delivery_date, "%Y-%m-%d").replace(tzinfo=ZoneInfo(timezone_name))
    except ValueError as error:
        raise ValueError("Delivery date must use YYYY-MM-DD") from error
    start = start_local.astimezone(timezone.utc)
    end = (start_local + timedelta(days=1)).astimezone(timezone.utc)
    step = timedelta(minutes=product_minutes)
    return [start + index * step for index in range(int((end-start) / step))]
