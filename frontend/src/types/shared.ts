/** shared API contracts. Values here are validated by the backend, not by TypeScript. */
export type Battery = {
  capacity_mwh: number;
  max_charge_power_mw: number;
  max_discharge_power_mw: number;
  initial_soc_mwh: number;
  min_soc_mwh: number;
  max_soc_mwh: number;
  target_soc_mwh: number;
  round_trip_efficiency: number;
  degradation_cost_eur_per_mwh: number;
  max_equivalent_cycles: number;
  grid_limit_mw: number;
  unavailable_intervals: number[];
};
export type Market = {
  market_name: string;
  bidding_zone: string;
  currency: string;
  timezone: string;
  product_minutes: 15 | 60;
  gate_closure_local: string;
  volume_increment_mw: number;
  price_increment_eur_mwh: number;
  min_price_eur_mwh: number;
  max_price_eur_mwh: number;
  exchange_fee_eur_per_mwh: number;
  exchange_fee_policy?: "excluded" | "configured";
  clearing_fee_eur_per_mwh: number;
  assumptions_unverified: boolean;
};
export type Dispatch = {
  interval: number;
  timestamp_utc: string;
  timestamp_local: string;
  price_eur_mwh: number;
  action: "charge" | "discharge" | "idle";
  power_mw: number;
  grid_energy_mwh: number;
  battery_energy_mwh: number;
  soc_mwh: number;
  interval_pnl_eur: number;
  cumulative_pnl_eur: number;
  sales_revenue_eur: number;
  purchase_cost_eur: number;
  degradation_cost_eur: number;
  transaction_fee_eur: number;
};
export type ValidationStatus = "passed" | "warning" | "failed";
export type AuditMetadata = {
  schema_version: number;
  input_hash: string;
  forecast_version: string;
  optimizer_version: string;
  validation_version: string;
  modified_by_trader: boolean;
  assumption_sources?: Record<string, string>;
};
