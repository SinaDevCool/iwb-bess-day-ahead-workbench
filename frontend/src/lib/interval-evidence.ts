import type {
  Battery,
  Dispatch,
  SimulatedOrderResult,
  OrderSimulation,
  Simulation,
} from "@/types/api";
/** Projection only: the backend owns power, energy and financial calculations. */
export function intervalEvidence(result: OrderSimulation | Simulation) {
  const rows =
    ("proposal" in result ? result.proposal?.implied_dispatch : undefined) ?? result.dispatch;
  const outcomes = "order_results" in result ? result.order_results : [];
  return projectIntervals(rows, result.battery, result.market.product_minutes, outcomes);
}
/** One chronological projection shared by the chart and interval table. */
export function projectIntervals(
  rows: Dispatch[],
  battery: Battery,
  minutes: number,
  outcomes: SimulatedOrderResult[] = [],
) {
  const duration = minutes * 60000;
  return rows.map((row, i) => ({
    ...row,
    id: new Date(row.timestamp_utc).toISOString(),
    start: Date.parse(row.timestamp_utc),
    end: Date.parse(row.timestamp_utc) + duration,
    socBefore: i ? rows[i - 1].soc_mwh : battery.initial_soc_mwh,
    orders: outcomes.filter(
      (o) => Date.parse(o.submitted_order.delivery_start_utc) === Date.parse(row.timestamp_utc),
    ),
  }));
}
export function intervalAtTime(starts: number[], duration: number, timestamp: number) {
  return starts.findIndex((start) => timestamp >= start && timestamp < start + duration);
}
