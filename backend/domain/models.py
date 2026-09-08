from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class BatteryConfig(BaseModel):
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
    unavailable_intervals: list[int] = []

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
    assumptions_unverified: bool = True


class PricePoint(BaseModel):
    timestamp_utc: datetime
    price_eur_mwh: float
    low_eur_mwh: float | None = None
    high_eur_mwh: float | None = None


class SimulationRequest(BaseModel):
    delivery_date: str = "2026-09-09"
    scenario_name: str = "Expected forecast"
    battery: BatteryConfig = BatteryConfig()
    market: MarketConfig = MarketConfig()
    prices: list[PricePoint] | None = None
    price_multiplier: float = Field(1, gt=0)
    peak_reduction_eur_mwh: float = Field(0, ge=0)
    strategy: Literal["expected_value", "conservative"] = "expected_value"


class DispatchRow(BaseModel):
    interval: int
    timestamp_utc: datetime
    timestamp_local: str
    price_eur_mwh: float
    action: Literal["charge", "discharge", "idle"]
    power_mw: float
    grid_energy_mwh: float
    battery_energy_mwh: float
    soc_mwh: float
    interval_pnl_eur: float
    cumulative_pnl_eur: float


class ValidationFinding(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    interval: int | None = None


class ValidationResult(BaseModel):
    status: Literal["passed", "warning", "failed"]
    findings: list[ValidationFinding]


class Order(BaseModel):
    order_id: str
    delivery_start_utc: datetime
    delivery_end_utc: datetime
    delivery_local: str
    product: str
    side: Literal["BUY", "SELL"]
    volume_mw: float
    energy_mwh: float
    limit_price_eur_mwh: float
    expected_price_eur_mwh: float
    expected_contribution_eur: float
    confidence: Literal["medium", "high"]
    status: Literal["DRAFT", "VALIDATED", "APPROVED"] = "DRAFT"
    explanation: str


class OrderAdjustment(BaseModel):
    order_id: str
    volume_mw: float | None = Field(None, gt=0)
    limit_price_eur_mwh: float | None = None
    exclude: bool = False
    comment: str = Field(..., min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_change(self):
        if not self.exclude and self.volume_mw is None and self.limit_price_eur_mwh is None:
            raise ValueError("An adjustment must change volume, price, or exclude the order")
        return self


class OrderProposalEdit(BaseModel):
    adjustments: list[OrderAdjustment] = Field(..., min_length=1)


class SimulationResult(BaseModel):
    simulation_id: str
    created_at_utc: datetime
    delivery_date: str
    scenario_name: str
    data_mode: str = "illustrative"
    submission_mode: str = "preview_only"
    battery: BatteryConfig
    market: MarketConfig
    dispatch: list[DispatchRow]
    orders: list[Order]
    validation: ValidationResult
    summary: dict
    optimization: dict
    proposal: dict
    audit: dict
