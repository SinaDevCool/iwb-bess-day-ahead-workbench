"""Configuration contracts; field names remain API-compatible."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BatteryConfig(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    capacity_mwh: float = Field(100, gt=0)
    max_charge_power_mw: float = Field(50, gt=0)
    max_discharge_power_mw: float = Field(50, gt=0)
    initial_soc_mwh: float = 50
    min_soc_mwh: float = 10
    max_soc_mwh: float = 90
    target_soc_mwh: float = 50
    round_trip_efficiency: float = Field(0.90, gt=0, le=1)
    degradation_cost_eur_per_mwh: float = Field(3, ge=0)
    max_equivalent_cycles: float = Field(1.5, gt=0)
    grid_limit_mw: float = Field(50, gt=0)
    unavailable_intervals: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_soc(self):
        if not 0 <= self.min_soc_mwh < self.max_soc_mwh <= self.capacity_mwh:
            raise ValueError("SOC bounds must satisfy 0 <= min < max <= capacity")
        if not self.min_soc_mwh <= self.initial_soc_mwh <= self.max_soc_mwh:
            raise ValueError("Initial SOC must be inside the SOC envelope")
        if not self.min_soc_mwh <= self.target_soc_mwh <= self.max_soc_mwh:
            raise ValueError("Target SOC must be inside the SOC envelope")
        return self


class MarketConfig(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    market_name: str = "Swiss Day-Ahead (configuration assumption)"
    bidding_zone: str = "CH"
    currency: str = "EUR"
    timezone: str = "Europe/Zurich"
    product_minutes: Literal[15, 60] = 60
    gate_closure_local: str = "12:00"
    volume_increment_mw: float = Field(0.1, gt=0)
    price_increment_eur_mwh: float = Field(0.01, gt=0)
    min_price_eur_mwh: float = -500
    max_price_eur_mwh: float = 4000
    exchange_fee_eur_per_mwh: float = Field(0, ge=0)
    exchange_fee_policy: Literal["excluded", "configured"] = "excluded"
    clearing_fee_eur_per_mwh: float = Field(0.015, ge=0)
    assumptions_unverified: bool = True

    @model_validator(mode="after")
    def validate_market(self):
        # Legacy clients only sent a numeric exchange fee. Preserve that
        # behavior while allowing new clients to distinguish excluded/unknown
        # from a confirmed contractual zero.
        if self.exchange_fee_eur_per_mwh > 0 and "exchange_fee_policy" not in self.model_fields_set:
            self.exchange_fee_policy = "configured"
        if self.min_price_eur_mwh >= self.max_price_eur_mwh:
            raise ValueError("Minimum market price must be below maximum market price")
        try:
            datetime.strptime(self.gate_closure_local, "%H:%M")
        except ValueError as error:
            raise ValueError("Gate closure must use HH:MM in local market time") from error
        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as error:
            raise ValueError(f"Unknown IANA timezone: {self.timezone}") from error
        if len(self.currency) != 3 or not self.currency.isalpha():
            raise ValueError("Currency must be a three-letter code")
        if not self.bidding_zone.strip():
            raise ValueError("Bidding zone is required")
        return self


class ScenarioType(str, Enum):
    EXPECTED = "expected"
    DOWNSIDE = "downside"
    PEAK_COMPRESSION = "peak_compression"
    UPSIDE = "upside"


class ScenarioProbability(BaseModel):
    downside: float = Field(0.20, ge=0, le=1)
    expected: float = Field(0.60, ge=0, le=1)
    upside: float = Field(0.20, ge=0, le=1)

    @model_validator(mode="after")
    def validate_total(self):
        if abs(self.downside + self.expected + self.upside - 1) > 1e-6:
            raise ValueError("Scenario probabilities must sum to 1")
        return self
