from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from backend.domain.models import DispatchRow, MarketConfig, Order


def build_orders(simulation_id: str, rows: list[DispatchRow], market: MarketConfig):
    orders = []
    zone = ZoneInfo(market.timezone)
    for row in rows:
        if row.action == "idle" or abs(row.power_mw) < 1e-8:
            continue
        side = "BUY" if row.action == "charge" else "SELL"
        volume = _round_increment(abs(row.power_mw), market.volume_increment_mw)
        price = _round_increment(row.price_eur_mwh, market.price_increment_eur_mwh)
        start = row.timestamp_utc
        end = start + timedelta(minutes=market.product_minutes)
        gross = row.interval_pnl_eur
        orders.append(Order(
            order_id=f"IWB-DA-{start.strftime('%Y%m%d')}-{row.interval + 1:03d}-{side}",
            delivery_start_utc=start,
            delivery_end_utc=end,
            delivery_local=start.astimezone(zone).strftime("%d.%m.%Y %H:%M %Z"),
            product=f"DAY_AHEAD_{market.product_minutes}MIN",
            side=side,
            volume_mw=volume,
            energy_mwh=round(volume * market.product_minutes / 60, 4),
            limit_price_eur_mwh=price,
            expected_price_eur_mwh=row.price_eur_mwh,
            expected_contribution_eur=round(gross, 2),
            confidence="medium",
            explanation=("Charge while expected price is comparatively low" if side == "BUY" else "Discharge while expected price is comparatively high"),
        ))
    return orders


def _round_increment(value: float, increment: float):
    return round(round(value / increment) * increment, 6)

