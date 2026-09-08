from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.domain.models import MarketConfig, PricePoint


HOURLY_PRICES = [55, 50, 45, 40, 38, 35, 32, 45, 60, 75, 82, 70, 60, 55, 48, 45, 58, 90, 120, 105, 80, 68, 60, 52]


def build_demo_forecast(delivery_date: str, market: MarketConfig) -> list[PricePoint]:
    local_zone = ZoneInfo(market.timezone)
    local_start = datetime.fromisoformat(delivery_date).replace(tzinfo=local_zone)
    local_end = local_start + timedelta(days=1)
    utc_start = local_start.astimezone(timezone.utc)
    utc_end = local_end.astimezone(timezone.utc)
    step = timedelta(minutes=market.product_minutes)
    points: list[PricePoint] = []
    cursor = utc_start
    while cursor < utc_end:
        local = cursor.astimezone(local_zone)
        hour = local.hour
        base = HOURLY_PRICES[hour]
        sub = local.minute / 60
        price = base + 2.5 * math.sin(sub * math.pi * 2)
        points.append(PricePoint(
            timestamp_utc=cursor,
            price_eur_mwh=round(price, 2),
            low_eur_mwh=round(price - 10, 2),
            high_eur_mwh=round(price + 12, 2),
        ))
        cursor += step
    return points


def apply_scenario(points: list[PricePoint], multiplier: float, peak_reduction: float, conservative: bool) -> list[PricePoint]:
    result = []
    for point in points:
        price = point.price_eur_mwh * multiplier
        if price >= 80:
            price -= peak_reduction
        if conservative:
            # A trader downside case should compress the usable arbitrage spread:
            # charging hours become more expensive while sale peaks become weaker.
            if point.price_eur_mwh >= 70:
                price = min(price, point.price_eur_mwh - max(peak_reduction, 15))
            elif point.price_eur_mwh <= 50:
                price = max(price, point.price_eur_mwh + 5)
            else:
                price = point.price_eur_mwh
        result.append(point.model_copy(update={"price_eur_mwh": round(price, 2)}))
    return result
