from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
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


class PricePoint(BaseModel):
    timestamp_utc: datetime
    price_eur_mwh: float
    low_eur_mwh: float | None = None
    high_eur_mwh: float | None = None


class ForecastMetadata(BaseModel):
    source_type: Literal["illustrative", "manual", "file"] = "illustrative"
    source_name: str = "IWB illustrative profile"
    version: str = "illustrative-v1"
    created_at_utc: datetime | None = None
    bidding_zone: str = "CH"


class SubmittedOrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class OrderExecutionStatus(str, Enum):
    EXECUTED = "EXECUTED"
    NOT_EXECUTED = "NOT_EXECUTED"
    PHYSICALLY_INFEASIBLE = "PHYSICALLY_INFEASIBLE"


class SubmittedOrder(BaseModel):
    client_order_id: str = Field(..., min_length=1, max_length=80)
    delivery_start_utc: datetime
    side: Literal["BUY", "SELL"]
    order_type: SubmittedOrderType
    volume_mw: float = Field(..., gt=0)
    limit_price_eur_mwh: float | None = None

    @model_validator(mode="after")
    def validate_order_type(self):
        if self.order_type == SubmittedOrderType.LIMIT and self.limit_price_eur_mwh is None:
            raise ValueError("Limit orders require a limit price")
        if self.order_type == SubmittedOrderType.MARKET and self.limit_price_eur_mwh is not None:
            raise ValueError("Market orders must not contain a limit price")
        return self


class SimulationRequest(BaseModel):
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
    horizon_policy: Literal["minimum_reserve", "terminal_value", "next_day_proxy", "multi_day"] = "minimum_reserve"
    terminal_value_eur_per_mwh: float = Field(0, ge=0)
    lookahead_hours: int = Field(4, ge=1, le=24)
    scenario_probabilities: ScenarioProbability = Field(default_factory=ScenarioProbability)

    @model_validator(mode="after")
    def validate_request(self):
        try:
            datetime.strptime(self.delivery_date, "%Y-%m-%d")
        except ValueError as error:
            raise ValueError("Delivery date must use YYYY-MM-DD") from error
        if len(self.battery.unavailable_intervals) != len(set(self.battery.unavailable_intervals)):
            raise ValueError("Unavailable intervals must be unique")
        local_zone = ZoneInfo(self.market.timezone)
        local_date = datetime.strptime(self.delivery_date, "%Y-%m-%d").date()
        start = datetime.combine(local_date, time.min, tzinfo=local_zone).astimezone(timezone.utc)
        end = datetime.combine(local_date + timedelta(days=1), time.min, tzinfo=local_zone).astimezone(timezone.utc)
        interval_count = int((end - start).total_seconds() / 60 / self.market.product_minutes)
        if any(index < 0 or index >= interval_count for index in self.battery.unavailable_intervals):
            raise ValueError(f"Unavailable intervals must be between 0 and {interval_count - 1} for this delivery day")
        if self.prices is not None and self.price_values is not None:
            raise ValueError("Provide either timestamped forecast points or a manual price series, not both")
        if self.forecast.source_type == "manual" and self.prices is None and self.price_values is None:
            raise ValueError("A manual forecast source requires forecast prices")
        if self.forecast.bidding_zone != self.market.bidding_zone:
            raise ValueError("Forecast bidding zone must match the configured market")
        if self.prices is not None:
            timestamps = [point.timestamp_utc for point in self.prices]
            if timestamps != sorted(timestamps) or len(timestamps) != len(set(timestamps)):
                raise ValueError("Forecast timestamps must be unique and chronological")
            if any(not self.market.min_price_eur_mwh <= point.price_eur_mwh <= self.market.max_price_eur_mwh for point in self.prices):
                raise ValueError("Forecast price is outside configured market limits")
            if len(self.prices) != interval_count:
                raise ValueError(f"Forecast must contain exactly {interval_count} delivery intervals")
            if any(point.timestamp_utc < start or point.timestamp_utc >= end for point in self.prices):
                raise ValueError("Forecast timestamps must cover only the configured local delivery day")
        if self.price_values is not None:
            if len(self.price_values) != interval_count:
                raise ValueError(f"Manual forecast must contain exactly {interval_count} prices")
            if any(not self.market.min_price_eur_mwh <= value <= self.market.max_price_eur_mwh for value in self.price_values):
                raise ValueError("Manual forecast price is outside configured market limits")
        return self


class OrderSimulationRequest(BaseModel):
    delivery_date: str = "2026-09-09"
    battery: BatteryConfig = Field(default_factory=BatteryConfig)
    market: MarketConfig = Field(default_factory=MarketConfig)
    prices: list[PricePoint] | None = None
    price_values: list[float] | None = None
    forecast: ForecastMetadata = Field(default_factory=ForecastMetadata)
    orders: list[SubmittedOrder] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_request(self):
        SimulationRequest(
            delivery_date=self.delivery_date,
            battery=self.battery,
            market=self.market,
            prices=self.prices,
            price_values=self.price_values,
            forecast=self.forecast,
        )
        local_zone = ZoneInfo(self.market.timezone)
        local_date = datetime.strptime(self.delivery_date, "%Y-%m-%d").date()
        start = datetime.combine(local_date, time.min, tzinfo=local_zone).astimezone(timezone.utc)
        end = datetime.combine(local_date + timedelta(days=1), time.min, tzinfo=local_zone).astimezone(timezone.utc)
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
                raise ValueError(f"Order {order.client_order_id} is not aligned to a delivery interval")
            volume_ratio = order.volume_mw / self.market.volume_increment_mw
            if abs(volume_ratio - round(volume_ratio)) > 1e-6:
                raise ValueError(f"Order {order.client_order_id} violates the configured volume increment")
            if order.limit_price_eur_mwh is not None:
                if not self.market.min_price_eur_mwh <= order.limit_price_eur_mwh <= self.market.max_price_eur_mwh:
                    raise ValueError(f"Order {order.client_order_id} limit price is outside market bounds")
                price_ratio = order.limit_price_eur_mwh / self.market.price_increment_eur_mwh
                if abs(price_ratio - round(price_ratio)) > 1e-6:
                    raise ValueError(f"Order {order.client_order_id} violates the configured price increment")
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
    observed_value: float | None = None
    configured_limit: float | None = None
    difference: float | None = None
    tolerance: float | None = None
    unit: str | None = None
    source: str | None = None


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
    break_even_price_eur_mwh: float = 0
    margin_to_break_even_eur_mwh: float = 0
    pricing_posture: Literal["execution", "balanced", "margin"] = "balanced"
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
    executable_rounding_delta_eur: float = 0
    terminal_energy_value_eur: float = 0
    total_decision_value_eur: float = 0


class OrderGenerationEvidence(MappingModel):
    method: str
    volume_increment_mw: float
    adjusted_order_count: int
    repaired_order_count: int
    volume_reduction_mwh: float
    contribution_delta_eur: float
    validation_status: str


class ScenarioOutcome(MappingModel):
    name: str
    probability: float
    contribution_eur: float


class RiskSummary(MappingModel):
    posture: str
    expected_contribution_eur: float
    downside_contribution_eur: float
    upside_contribution_eur: float
    worst_case_contribution_eur: float
    value_range_eur: float
    recommended_scenario: str
    recommendation: str
    outcomes: list[ScenarioOutcome]


class HorizonSummary(MappingModel):
    policy: str
    terminal_value_eur_per_mwh: float
    reserve_soc_mwh: float
    terminal_soc_mwh: float
    incremental_stored_energy_mwh: float
    terminal_energy_value_eur: float
    lookahead_hours: int = 0
    continuation_forecast_version: str | None = None


class SensitivityCase(MappingModel):
    value: float
    unit: str
    contribution_eur: float
    delta_eur: float
    feasible: bool = True
    bounded: bool = False
    explanation: str = ""


class SensitivityItem(MappingModel):
    key: str
    label: str
    baseline_value: float
    tested_value: float
    unit: str
    contribution_delta_eur: float
    marginal_value_eur: float
    interpretation: str
    category: Literal["operational", "strategy"] = "operational"
    default_selected: bool = False
    lower_case: SensitivityCase | None = None
    upper_case: SensitivityCase | None = None
    calculation: Literal["full_reoptimization"] = "full_reoptimization"


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
    assumption_sources: dict[str, str] = Field(default_factory=dict)


class SimulationResult(BaseModel):
    simulation_id: str
    display_name: str = Field(..., min_length=1, max_length=48)
    created_at_utc: datetime
    delivery_date: str
    scenario_name: str
    strategy: Literal["expected_value", "conservative"] = "expected_value"
    risk_posture: Literal["expected_value", "balanced", "downside_protected"] = "balanced"
    horizon_policy: Literal["minimum_reserve", "terminal_value", "next_day_proxy", "multi_day"] = "minimum_reserve"
    terminal_value_eur_per_mwh: float = 0
    price_multiplier: float = 1
    peak_reduction_eur_mwh: float = 0
    scenario_probabilities: ScenarioProbability = Field(default_factory=ScenarioProbability)
    lookahead_hours: int = 4
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
    order_generation: OrderGenerationEvidence
    risk: RiskSummary
    horizon: HorizonSummary
    forecast: ForecastMetadata = Field(default_factory=ForecastMetadata)
    forecast_points: list[PricePoint] = Field(default_factory=list)
    sensitivities: list[SensitivityItem] = Field(default_factory=list)
    approval_status: str | None = None


class SimulatedOrderResult(BaseModel):
    submitted_order: SubmittedOrder
    forecast_price_eur_mwh: float
    execution_status: OrderExecutionStatus
    executed_volume_mw: float
    execution_price_eur_mwh: float | None = None
    reason_code: str
    reason: str
    soc_before_mwh: float
    soc_after_mwh: float
    contribution_eur: float
    sales_revenue_eur: float = 0
    purchase_cost_eur: float = 0
    degradation_cost_eur: float = 0
    transaction_fee_eur: float = 0
    price_condition_operator: Literal["<=", ">="] | None = None
    price_condition_passed: bool = True
    price_margin_eur_mwh: float | None = None
    executed_energy_mwh: float = 0
    soc_delta_mwh: float = 0


class OrderSimulationSummary(BaseModel):
    submitted_order_count: int
    executed_order_count: int
    not_executed_order_count: int
    infeasible_order_count: int
    initial_soc_mwh: float
    final_soc_mwh: float
    min_soc_mwh: float
    max_soc_mwh: float
    charged_grid_mwh: float
    discharged_grid_mwh: float
    throughput_mwh: float
    equivalent_cycles: float
    sales_revenue_eur: float
    purchase_cost_eur: float
    degradation_cost_eur: float
    transaction_fee_eur: float
    net_contribution_eur: float


class OrderSimulationResult(BaseModel):
    simulation_id: str
    run_type: Literal["ORDER_SIMULATION"] = "ORDER_SIMULATION"
    created_at_utc: datetime
    delivery_date: str
    battery: BatteryConfig
    market: MarketConfig
    forecast: ForecastMetadata
    forecast_points: list[PricePoint]
    submitted_orders: list[SubmittedOrder]
    order_results: list[SimulatedOrderResult]
    dispatch: list[DispatchRow]
    validation: ValidationResult
    summary: OrderSimulationSummary
    audit: dict[str, object]
    submitted_portfolio_feasible: bool
    executed_schedule_feasible: bool


class SimulationRunSummary(BaseModel):
    """Compact, immutable projection used to discover comparable saved runs."""

    simulation_id: str
    created_at_utc: datetime
    display_name: str
    delivery_date: str
    scenario_name: str
    product_minutes: Literal[15, 60]
    risk_posture: str
    horizon_policy: str
    capacity_mwh: float
    validation_status: str
    modified_by_trader: bool
    expected_contribution_eur: float
    downside_contribution_eur: float | None = None
    upside_contribution_eur: float | None = None
    throughput_mwh: float
    equivalent_cycles: float
    order_count: int
    input_hash: str


class SimulationDisplayNameUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=48)

    @model_validator(mode="after")
    def normalize_display_name(self):
        self.display_name = " ".join(self.display_name.split())
        if not self.display_name or any(ord(character) < 32 for character in self.display_name):
            raise ValueError("Run name must contain visible text only")
        return self
