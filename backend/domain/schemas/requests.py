"""Requests contracts; field names remain API-compatible."""

from __future__ import annotations

from datetime import timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.domain.schemas.configuration import BatteryConfig, MarketConfig, ScenarioProbability
from backend.domain.schemas.forecast import ForecastMetadata, PricePoint
from backend.domain.schemas.orders import SubmittedOrder
from backend.domain.schemas.request_validation import validate_forecast_inputs


class SimulationRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    delivery_date: str = "2026-09-09"
    scenario_name: str = "Expected forecast"
    battery: BatteryConfig = Field(default_factory=BatteryConfig)
    market: MarketConfig = Field(default_factory=MarketConfig)
    prices: list[PricePoint] | None = None
    price_values: list[float] | None = None
    forecast: ForecastMetadata = Field(default_factory=ForecastMetadata)
    price_multiplier: float = Field(1, gt=0)
    peak_reduction_eur_mwh: float = Field(0, ge=0)
    strategy: Literal["expected_value", "conservative"] = "expected_value"
    risk_posture: Literal["expected_value", "balanced", "downside_protected"] = "balanced"
    horizon_policy: Literal["minimum_reserve", "terminal_value", "next_day_proxy", "multi_day"] = (
        "minimum_reserve"
    )
    terminal_value_eur_per_mwh: float = Field(0, ge=0)
    lookahead_hours: int = Field(4, ge=1, le=24)
    scenario_probabilities: ScenarioProbability = Field(default_factory=ScenarioProbability)
    include_sensitivities: bool = True

    @model_validator(mode="after")
    def validate_request(self):
        validate_forecast_inputs(
            self.delivery_date,
            self.battery,
            self.market,
            self.prices,
            self.price_values,
            self.forecast,
        )
        return self


class OrderSimulationRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    source_proposal_id: str | None = Field(None, max_length=80)
    delivery_date: str = "2026-09-09"
    battery: BatteryConfig = Field(default_factory=BatteryConfig)
    market: MarketConfig = Field(default_factory=MarketConfig)
    prices: list[PricePoint] | None = None
    price_values: list[float] | None = None
    forecast: ForecastMetadata = Field(default_factory=ForecastMetadata)
    orders: list[SubmittedOrder] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_request(self):
        start, end = validate_forecast_inputs(
            self.delivery_date,
            self.battery,
            self.market,
            self.prices,
            self.price_values,
            self.forecast,
        )
        ids = [order.client_order_id for order in self.orders]
        if len(ids) != len(set(ids)):
            raise ValueError("Submitted order IDs must be unique")
        for order in self.orders:
            if order.delivery_start_utc.tzinfo is None:
                raise ValueError("Order delivery timestamps must include a timezone")
            timestamp = order.delivery_start_utc.astimezone(timezone.utc)
            if timestamp < start or timestamp >= end:
                raise ValueError(f"Order {order.client_order_id} is outside the delivery day")
            elapsed_minutes = (timestamp - start).total_seconds() / 60
            ratio = elapsed_minutes / self.market.product_minutes
            if abs(ratio - round(ratio)) > 1e-9:
                raise ValueError(
                    f"Order {order.client_order_id} is not aligned to a delivery interval"
                )
            volume_ratio = order.volume_mw / self.market.volume_increment_mw
            if abs(volume_ratio - round(volume_ratio)) > 1e-6:
                raise ValueError(
                    f"Order {order.client_order_id} violates the configured volume increment"
                )
            if order.limit_price_eur_mwh is not None:
                if (
                    not self.market.min_price_eur_mwh
                    <= order.limit_price_eur_mwh
                    <= self.market.max_price_eur_mwh
                ):
                    raise ValueError(
                        f"Order {order.client_order_id} limit price is outside market bounds"
                    )
                price_ratio = order.limit_price_eur_mwh / self.market.price_increment_eur_mwh
                if abs(price_ratio - round(price_ratio)) > 1e-6:
                    raise ValueError(
                        f"Order {order.client_order_id} violates the configured price increment"
                    )
        return self
