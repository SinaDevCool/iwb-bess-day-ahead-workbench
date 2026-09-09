export type Battery = {
  capacity_mwh: number; max_charge_power_mw: number; max_discharge_power_mw: number;
  initial_soc_mwh: number; min_soc_mwh: number; max_soc_mwh: number; target_soc_mwh: number;
  round_trip_efficiency: number; degradation_cost_eur_per_mwh: number;
  max_equivalent_cycles: number; grid_limit_mw: number; unavailable_intervals: number[];
};
export type Market = {
  market_name: string; bidding_zone: string; currency: string; timezone: string;
  product_minutes: 15 | 60; gate_closure_local: string; volume_increment_mw: number;
  price_increment_eur_mwh: number; min_price_eur_mwh: number; max_price_eur_mwh: number;
  exchange_fee_eur_per_mwh: number; exchange_fee_policy?: "excluded" | "configured"; clearing_fee_eur_per_mwh: number;
  assumptions_unverified: boolean;
};
export type Dispatch = {
  interval: number; timestamp_utc: string; timestamp_local: string; price_eur_mwh: number;
  action: "charge" | "discharge" | "idle"; power_mw: number; grid_energy_mwh: number;
  battery_energy_mwh: number; soc_mwh: number; interval_pnl_eur: number; cumulative_pnl_eur: number;
  sales_revenue_eur: number; purchase_cost_eur: number; degradation_cost_eur: number; transaction_fee_eur: number;
};
export type Order = {
  order_id: string; delivery_start_utc: string; delivery_end_utc: string; delivery_local: string;
  product: string; side: "BUY" | "SELL"; volume_mw: number; energy_mwh: number;
  limit_price_eur_mwh: number; expected_price_eur_mwh: number; expected_contribution_eur: number;
  sales_revenue_eur: number; purchase_cost_eur: number; degradation_cost_eur: number; transaction_fee_eur: number;
  confidence: string; status: string; explanation: string;
};
export type ValidationStatus = "passed" | "warning" | "failed";
export type SimulationSummary = {
  expected_contribution_eur: number; optimized_contribution_eur: number;
  baseline_proposal_contribution_eur: number; proposal_contribution_eur: number;
  proposal_terminal_soc_mwh: number; proposal_throughput_mwh: number;
  proposal_equivalent_cycles: number; proposal_min_soc_mwh: number; proposal_max_soc_mwh: number;
  proposal_sales_revenue_eur: number; proposal_purchase_cost_eur: number;
  proposal_degradation_cost_eur: number; proposal_transaction_fee_eur: number;
  proposal_buy_volume_mwh: number; proposal_sell_volume_mwh: number;
  trader_adjustment_delta_eur: number; sales_revenue_eur: number; purchase_cost_eur: number;
  degradation_cost_eur: number; transaction_fee_eur: number; charged_grid_mwh: number;
  discharged_grid_mwh: number; throughput_mwh: number; equivalent_cycles: number;
  min_soc_mwh: number; max_soc_mwh: number; order_count: number; buy_volume_mwh: number;
  sell_volume_mwh: number; executable_rounding_delta_eur: number;
  terminal_energy_value_eur: number; total_decision_value_eur: number;
};
export type AuditMetadata = {
  schema_version: number; input_hash: string; forecast_version: string;
  optimizer_version: string; validation_version: string; modified_by_trader: boolean;
  assumption_sources?: Record<string, string>;
};
export type RiskSummary = {
  posture: string; expected_contribution_eur: number; downside_contribution_eur: number;
  upside_contribution_eur: number; worst_case_contribution_eur: number; value_range_eur: number;
  recommended_scenario: string; recommendation: string;
  outcomes: { name: string; probability: number; contribution_eur: number }[];
};
export type SimulationRunSummary = {
  simulation_id: string; created_at_utc: string; display_name: string; delivery_date: string;
  scenario_name: string; product_minutes: 15 | 60; risk_posture: string; horizon_policy: string;
  capacity_mwh: number; validation_status: string; modified_by_trader: boolean;
  expected_contribution_eur: number; downside_contribution_eur?: number; upside_contribution_eur?: number;
  throughput_mwh: number; equivalent_cycles: number; order_count: number; input_hash: string;
};
export type ComparisonMetric = "contribution" | "throughput" | "cycles" | "orders";
export type Simulation = {
  simulation_id: string; created_at_utc: string; delivery_date: string; scenario_name: string;
  strategy?: "expected_value" | "conservative"; risk_posture?: "expected_value" | "balanced" | "downside_protected"; horizon_policy?: "minimum_reserve" | "terminal_value" | "next_day_proxy"; terminal_value_eur_per_mwh?: number; price_multiplier?: number; peak_reduction_eur_mwh?: number; scenario_probabilities?: { downside: number; expected: number; upside: number }; lookahead_hours?: number; proposal_revision?: number;
  data_mode: string; submission_mode: string; battery: Battery; market: Market; dispatch: Dispatch[];
  orders: Order[]; validation: { status: ValidationStatus; findings: { severity: string; code: string; message: string; interval?: number }[] };
  summary: SimulationSummary; optimization: { engine: string; prototype_solver: boolean; solver_status?: string; solve_time_ms?: number; mip_gap?: number; objective: string; objective_value_eur: number; terminal_soc_mwh: number; constraint_status: string; constraints: string[] };
  proposal?: { proposal_contribution_eur: number; proposal_terminal_soc_mwh: number; proposal_throughput_mwh: number; proposal_equivalent_cycles: number; proposal_min_soc_mwh: number; proposal_max_soc_mwh: number; proposal_sales_revenue_eur: number; proposal_purchase_cost_eur: number; proposal_degradation_cost_eur: number; proposal_buy_volume_mwh: number; proposal_sell_volume_mwh: number; implied_soc_mwh: number[]; implied_dispatch?: Dispatch[] };
  audit: AuditMetadata; approval_status?: string;
  order_generation?: { method: string; volume_increment_mw: number; adjusted_order_count: number; repaired_order_count: number; volume_reduction_mwh: number; contribution_delta_eur: number; validation_status: string };
  risk?: RiskSummary;
  horizon?: { policy: string; terminal_value_eur_per_mwh: number; reserve_soc_mwh: number; terminal_soc_mwh: number; incremental_stored_energy_mwh: number; terminal_energy_value_eur: number };
};
