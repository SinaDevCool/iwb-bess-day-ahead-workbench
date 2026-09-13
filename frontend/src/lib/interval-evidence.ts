import type { OrderSimulation, Simulation } from "@/types/api";
/** Projection only: the backend owns power, energy and financial calculations. */
export function intervalEvidence(result: OrderSimulation | Simulation) {
  const rows =
    ("proposal" in result ? result.proposal?.implied_dispatch : undefined) ?? result.dispatch;
  const outcomes = "order_results" in result ? result.order_results : [];
  const duration = result.market.product_minutes * 60000;
  return rows.map((row, i) => ({
    ...row,
    id: new Date(row.timestamp_utc).toISOString(),
    start: Date.parse(row.timestamp_utc),
    end: Date.parse(row.timestamp_utc) + duration,
    socBefore: i ? rows[i - 1].soc_mwh : result.battery.initial_soc_mwh,
    orders: outcomes.filter(
      (o) => Date.parse(o.submitted_order.delivery_start_utc) === Date.parse(row.timestamp_utc),
    ),
  }));
}
export function intervalAtTime(starts: number[], duration: number, timestamp: number) {
  return starts.findIndex((start) => timestamp >= start && timestamp < start + duration);
}
