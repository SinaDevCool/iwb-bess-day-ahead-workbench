from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    clearing_fee_eur_per_mwh: float = Field(0.015, ge=0)
    assumptions_unverified: bool = True

    @model_validator(mode="after")
    def validate_market(self):
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
    AVAILABILITY_STRESS = "availability_stress"


class PricePoint(BaseModel):
    timestamp_utc: datetime
    price_eur_mwh: float
    low_eur_mwh: float | None = None
    high_eur_mwh: float | None = None


class SimulationRequest(BaseModel):
    delivery_date: str = "2026-09-09"
    scenario_name: str = "Expected forecast"
    battery: BatteryConfig = Field(default_factory=BatteryConfig)
    market: MarketConfig = Field(default_factory=MarketConfig)
    prices: list[PricePoint] | None = None
    price_multiplier: float = Field(1, gt=0)
    peak_reduction_eur_mwh: float = Field(0, ge=0)
    strategy: Literal["expected_value", "conservative"] = "expected_value"

    @model_validator(mode="after")
    def validate_request(self):
        try:
            datetime.strptime(self.delivery_date, "%Y-%m-%d")
        except ValueError as error:
            raise ValueError("Delivery date must use YYYY-MM-DD") from error
        if len(self.battery.unavailable_intervals) != len(set(self.battery.unavailable_intervals)):
            raise ValueError("Unavailable intervals must be unique")
        if self.prices:
            timestamps = [point.timestamp_utc for point in self.prices]
            if timestamps != sorted(timestamps) or len(timestamps) != len(set(timestamps)):
                raise ValueError("Forecast timestamps must be unique and chronological")
            if any(not self.market.min_price_eur_mwh <= point.price_eur_mwh <= self.market.max_price_eur_mwh for point in self.prices):
                raise ValueError("Forecast price is outside configured market limits")
        return self


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
    sales_revenue_eur: float = 0
    purchase_cost_eur: float = 0
    degradation_cost_eur: float = 0
    transaction_fee_eur: float = 0


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
    sales_revenue_eur: float = 0
    purchase_cost_eur: float = 0
    degradation_cost_eur: float = 0
    transaction_fee_eur: float = 0
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

    @model_validator(mode="after")
    def validate_unique_orders(self):
        ids = [item.order_id for item in self.adjustments]
        if len(ids) != len(set(ids)):
            raise ValueError("Each order may be adjusted only once per request")
        if any(item.exclude and (item.volume_mw is not None or item.limit_price_eur_mwh is not None) for item in self.adjustments):
            raise ValueError("An excluded order cannot also change volume or price")
        return self


class MappingModel(BaseModel):
    """Typed API evidence that remains compatible with existing key access."""
    model_config = ConfigDict(extra="forbid")

    def __getitem__(self, key: str):
        return getattr(self, key)


class ProposalSummary(MappingModel):
    proposal_contribution_eur: float
    proposal_terminal_soc_mwh: float
    proposal_throughput_mwh: float
    proposal_equivalent_cycles: float
    proposal_min_soc_mwh: float
    proposal_max_soc_mwh: float
    proposal_sales_revenue_eur: float
    proposal_purchase_cost_eur: float
    proposal_degradation_cost_eur: float
    proposal_transaction_fee_eur: float
    proposal_buy_volume_mwh: float
    proposal_sell_volume_mwh: float
    implied_soc_mwh: list[float]
    implied_dispatch: list[DispatchRow]


class SimulationSummary(MappingModel):
    expected_contribution_eur: float
    optimized_contribution_eur: float
    baseline_proposal_contribution_eur: float
    proposal_contribution_eur: float
    proposal_terminal_soc_mwh: float
    proposal_throughput_mwh: float
    proposal_equivalent_cycles: float
    proposal_min_soc_mwh: float
    proposal_max_soc_mwh: float
    proposal_sales_revenue_eur: float
    proposal_purchase_cost_eur: float
    proposal_degradation_cost_eur: float
    proposal_transaction_fee_eur: float
    proposal_buy_volume_mwh: float
    proposal_sell_volume_mwh: float
    trader_adjustment_delta_eur: float
    sales_revenue_eur: float
    purchase_cost_eur: float
    degradation_cost_eur: float
    transaction_fee_eur: float
    charged_grid_mwh: float
    discharged_grid_mwh: float
    throughput_mwh: float
    equivalent_cycles: float
    min_soc_mwh: float
    max_soc_mwh: float
    order_count: int
    buy_volume_mwh: float
    sell_volume_mwh: float


class OptimizationEvidence(MappingModel):
    engine: str
    prototype_solver: bool
    solver_status: str
    solve_time_ms: float
    mip_gap: float
    objective: str
    objective_value_eur: float
    terminal_soc_mwh: float
    throughput_mwh: float
    constraint_status: str
    constraints: list[str]


class AuditMetadata(MappingModel):
    schema_version: int
    input_hash: str
    forecast_version: str
    optimizer_version: str
    validation_version: str
    modified_by_trader: bool


class SimulationResult(BaseModel):
    simulation_id: str
    created_at_utc: datetime
    delivery_date: str
    scenario_name: str
    strategy: Literal["expected_value", "conservative"] = "expected_value"
    price_multiplier: float = 1
    peak_reduction_eur_mwh: float = 0
    proposal_revision: int = 1
    data_mode: str = "illustrative"
    submission_mode: str = "preview_only"
    battery: BatteryConfig
    market: MarketConfig
    dispatch: list[DispatchRow]
    orders: list[Order]
    validation: ValidationResult
    summary: SimulationSummary
    optimization: OptimizationEvidence
    proposal: ProposalSummary
    audit: AuditMetadata
    approval_status: str | None = None
