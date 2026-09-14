"""Results contracts; field names remain API-compatible."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.domain.schemas.configuration import BatteryConfig, MarketConfig, ScenarioProbability
from backend.domain.schemas.dispatch import DispatchRow, ValidationResult
from backend.domain.schemas.forecast import ForecastMetadata, PricePoint
from backend.domain.schemas.orders import Order, OrderExecutionStatus, SubmittedOrder
from backend.domain.schemas.simulation_assumptions import SimulationAssumptions


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
    horizon_policy: Literal["minimum_reserve", "terminal_value", "next_day_proxy", "multi_day"] = (
        "minimum_reserve"
    )
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
    # Before/after SoC is interval-wide; soc_delta_mwh belongs to this order.
    soc_evidence_scope: Literal["delivery_interval"] = "delivery_interval"
    interval_order_count: int = 1
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
    price_condition_passed: bool | None = None
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
    # Includes physical exclusions and day-wide failures, not price rejection.
    submitted_portfolio_feasible: bool
    # Validity after exclusions; terminal reserve can fail with zero excluded orders.
    executed_schedule_feasible: bool
    # Missing on historical results: never backfill new semantics into old runs.
    assumptions: SimulationAssumptions | None = None


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
