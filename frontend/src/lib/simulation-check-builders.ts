import type { OrderSimulation } from "@/types/api";
import type { Check } from "./simulation-evidence";
/** Display classification only; errors from the backend always take precedence. */
export const boundaryCheck = (
  b: OrderSimulation["battery"],
  errors: Set<string>,
  label: string,
  observed: number,
  allowed: number,
  unit: string,
  minimum: boolean,
  codes: string[],
  evidence: string,
): Check => {
  const margin = minimum ? observed - allowed : allowed - observed;
  const epsilon = unit === "EFC" ? 0.15 / (2 * b.capacity_mwh) : 0.001;
  const status =
    (errors.size && codes.some((c) => errors.has(c))) || margin < -epsilon
      ? "Issue"
      : Math.abs(margin) <= epsilon
        ? "Fully used"
        : "Headroom";
  // Minimum-bound bars represent closeness to the lower boundary, including zero.
  const fraction = minimum
    ? 1 - Math.max(0, margin) / Math.max(b.max_soc_mwh - allowed, 1)
    : allowed
      ? observed / allowed
      : 0;
  return {
    label,
    observed,
    allowed,
    unit,
    margin,
    status,
    utilization: Math.max(0, Math.min(100, fraction * 100)),
    evidence,
  };
};

export const integrityCheck = (
  label: string,
  observed: number,
  allowed: number,
  unit: string,
  passed: boolean,
  evidence: string,
): Check => ({
  label,
  observed,
  allowed,
  unit,
  margin: allowed - observed,
  status: passed ? "Verified" : "Issue",
  utilization: passed ? 0 : 100,
  evidence,
});

/** Independent display evidence, calculated from the immutable saved schedule. */
export function integrityStatistics(r: OrderSimulation) {
  const b = r.battery,
    rows = r.dispatch;
  let prior = b.initial_soc_mwh,
    residual = 0;
  const eta = Math.sqrt(b.round_trip_efficiency),
    dt = r.market.product_minutes / 60;
  for (const row of rows) {
    const delta = row.power_mw < 0 ? -row.power_mw * dt * eta : (-row.power_mw * dt) / eta;
    residual = Math.max(residual, Math.abs(row.soc_mwh - prior - delta));
    prior = row.soc_mwh;
  }
  const coverage =
    rows.length === r.forecast_points.length &&
    rows.every(
      (row, i) => Date.parse(row.timestamp_utc) === Date.parse(r.forecast_points[i].timestamp_utc),
    );
  const unavailable = rows.filter(
    (row) => b.unavailable_intervals.includes(row.interval) && row.action !== "idle",
  ).length;
  return { residual, coverage, unavailable };
}
