import type { ForecastMetadata, ForecastPoint } from "./forecast";
/** simulation API contracts. Values here are validated by the backend, not by TypeScript. */
import type { SimulatedOrderResult, SubmittedOrder } from "./orders";
import type { Battery, Dispatch, Market, ValidationStatus } from "./shared";
export type OrderSimulationSummary = {
  submitted_order_count: number;
  executed_order_count: number;
  not_executed_order_count: number;
  infeasible_order_count: number;
  initial_soc_mwh: number;
  final_soc_mwh: number;
  min_soc_mwh: number;
  max_soc_mwh: number;
  charged_grid_mwh: number;
  discharged_grid_mwh: number;
  throughput_mwh: number;
  equivalent_cycles: number;
  sales_revenue_eur: number;
  purchase_cost_eur: number;
  degradation_cost_eur: number;
  transaction_fee_eur: number;
  net_contribution_eur: number;
};
export type OrderSimulation = {
  simulation_id: string;
  run_type: "ORDER_SIMULATION";
  created_at_utc: string;
  delivery_date: string;
  battery: Battery;
  market: Market;
  forecast: ForecastMetadata;
  forecast_points: ForecastPoint[];
  submitted_orders: SubmittedOrder[];
  order_results: SimulatedOrderResult[];
  dispatch: Dispatch[];
  validation: {
    status: ValidationStatus;
    findings: { severity: string; code: string; message: string; interval?: number }[];
  };
  summary: OrderSimulationSummary;
  audit: Record<string, unknown>;
  submitted_portfolio_feasible: boolean;
  executed_schedule_feasible: boolean;
  /** Absent on historical snapshots; do not infer current semantics for them. */
  assumptions?: {
    settlement: "entered_forecast";
    allocation: "full_if_eligible_and_feasible";
    price_comparison: "inclusive_exact";
    auction_allocation_modelled: false;
    physical_rejection: "exclude_batch_without_clipping";
    eligibility_order: "price_before_physics";
  } | null;
};
