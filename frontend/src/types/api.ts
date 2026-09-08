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
  assumptions_unverified: boolean;
};
export type Dispatch = {
  interval: number; timestamp_utc: string; timestamp_local: string; price_eur_mwh: number;
  action: "charge" | "discharge" | "idle"; power_mw: number; grid_energy_mwh: number;
  battery_energy_mwh: number; soc_mwh: number; interval_pnl_eur: number; cumulative_pnl_eur: number;
  sales_revenue_eur: number; purchase_cost_eur: number; degradation_cost_eur: number;
};
export type Order = {
  order_id: string; delivery_start_utc: string; delivery_end_utc: string; delivery_local: string;
  product: string; side: "BUY" | "SELL"; volume_mw: number; energy_mwh: number;
  limit_price_eur_mwh: number; expected_price_eur_mwh: number; expected_contribution_eur: number;
  sales_revenue_eur: number; purchase_cost_eur: number; degradation_cost_eur: number;
  confidence: string; status: string; explanation: string;
};
export type Simulation = {
  simulation_id: string; created_at_utc: string; delivery_date: string; scenario_name: string;
  strategy?: "expected_value" | "conservative"; price_multiplier?: number; peak_reduction_eur_mwh?: number; proposal_revision?: number;
  data_mode: string; submission_mode: string; battery: Battery; market: Market; dispatch: Dispatch[];
  orders: Order[]; validation: { status: string; findings: { severity: string; code: string; message: string; interval?: number }[] };
  summary: Record<string, number>; optimization: { engine: string; prototype_solver: boolean; solver_status?: string; solve_time_ms?: number; mip_gap?: number; objective: string; objective_value_eur: number; terminal_soc_mwh: number; constraint_status: string; constraints: string[] };
  proposal?: { proposal_contribution_eur: number; proposal_terminal_soc_mwh: number; proposal_throughput_mwh: number; proposal_equivalent_cycles: number; proposal_min_soc_mwh: number; proposal_max_soc_mwh: number; proposal_sales_revenue_eur: number; proposal_purchase_cost_eur: number; proposal_degradation_cost_eur: number; proposal_buy_volume_mwh: number; proposal_sell_volume_mwh: number; implied_soc_mwh: number[]; implied_dispatch?: Dispatch[] };
  audit: Record<string, string | boolean | number>; approval_status?: string;
};
