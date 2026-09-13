import type { OrderSimulation } from "@/types/api";

export type Check = {
  label: string;
  observed: number;
  allowed: number;
  unit: string;
  margin: number;
  status: "Issue" | "Fully used" | "Headroom" | "Verified" | "Not evaluated";
  utilization: number;
  evidence: string;
};

// Presentation only. Backend validation remains authoritative; limits are read
// from the saved simulation, never the mutable configuration panel.
export function simulationChecks(r: OrderSimulation): Check[] {
  const b = r.battery,
    rows = r.dispatch;
  const errors = new Set(
    r.validation.findings
      .filter((f) => f.severity === "error")
      .map((f) => f.code),
  );
  const bound = (
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
  const charge = Math.max(0, ...rows.map((x) => -x.power_mw));
  const discharge = Math.max(0, ...rows.map((x) => x.power_mw));
  const soc = [b.initial_soc_mwh, ...rows.map((x) => x.soc_mwh)];
  const checks = [
    bound(
      "Charge power",
      charge,
      Math.min(b.max_charge_power_mw, b.grid_limit_mw),
      "MW",
      false,
      ["charge_power_limit", "grid_limit"],
      "Peak charging power across the executed schedule; not average daily utilization. Effective limit is the smaller of charge and grid limits.",
    ),
    bound(
      "Discharge power",
      discharge,
      Math.min(b.max_discharge_power_mw, b.grid_limit_mw),
      "MW",
      false,
      ["discharge_power_limit", "grid_limit"],
      "Peak executed discharge power against the effective discharge limit.",
    ),
    bound(
      "Grid connection",
      Math.max(charge, discharge),
      b.grid_limit_mw,
      "MW",
      false,
      ["grid_limit"],
      "Largest absolute import or export instruction.",
    ),
    bound(
      "Minimum state of charge",
      Math.min(...soc),
      b.min_soc_mwh,
      "MWh",
      true,
      ["soc_below_min"],
      "Lowest stored energy, including initial SoC. Margin = observed minimum minus configured minimum.",
    ),
    bound(
      "Maximum state of charge",
      Math.max(...soc),
      b.max_soc_mwh,
      "MWh",
      false,
      ["soc_above_max"],
      "Highest stored energy, including initial SoC.",
    ),
    bound(
      "Daily cycle budget",
      r.summary.equivalent_cycles,
      b.max_equivalent_cycles,
      "EFC",
      false,
      ["cycle_limit"],
      "Executed battery throughput divided by twice nominal capacity.",
    ),
    bound(
      "End-of-day reserve",
      r.summary.final_soc_mwh,
      b.target_soc_mwh,
      "MWh",
      true,
      ["terminal_soc"],
      "Stored energy after the last delivery interval minus the required reserve.",
    ),
  ];
  const integrity = (
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
  let prior = b.initial_soc_mwh,
    residual = 0;
  const eta = Math.sqrt(b.round_trip_efficiency),
    dt = r.market.product_minutes / 60;
  for (const row of rows) {
    const delta =
      row.power_mw < 0 ? -row.power_mw * dt * eta : (-row.power_mw * dt) / eta;
    residual = Math.max(residual, Math.abs(row.soc_mwh - prior - delta));
    prior = row.soc_mwh;
  }
  const coverage =
    rows.length === r.forecast_points.length &&
    rows.every(
      (row, i) =>
        Date.parse(row.timestamp_utc) ===
        Date.parse(r.forecast_points[i].timestamp_utc),
    );
  const unavailable = rows.filter(
    (row) =>
      b.unavailable_intervals.includes(row.interval) && row.action !== "idle",
  ).length;
  checks.push(
    integrity(
      "Energy balance",
      residual,
      0.15,
      "MWh",
      residual <= 0.15 && !errors.has("energy_balance"),
      "SoC[t] = SoC[t−1] + charge × η × duration − discharge ÷ η × duration. Backend reconciliation tolerance: 0.15 MWh.",
    ),
    integrity(
      "Asset availability",
      unavailable,
      0,
      "conflicts",
      unavailable === 0 && !errors.has("unavailable"),
      b.unavailable_intervals.length +
        " unavailable intervals checked against executed dispatch.",
    ),
    integrity(
      "Interval coverage",
      rows.length,
      r.forecast_points.length,
      "intervals",
      coverage && !errors.has("interval_coverage"),
      "Matches the saved UTC delivery grid, including daylight-saving days.",
    ),
    integrity(
      "Operating mode",
      errors.has("operating_mode") ? 1 : 0,
      0,
      "issues",
      !errors.has("operating_mode"),
      "Backend checks action and signed power; opposite eligible orders in an interval are handled by the simulator's batch policy.",
    ),
    integrity(
      "Submitted order feasibility",
      r.summary.infeasible_order_count,
      0,
      "rejections",
      r.submitted_portfolio_feasible,
      "Price eligibility is separate from physical feasibility. Rejected orders are not silently optimized or partially filled.",
    ),
    {
      label: "Ramp rate",
      observed: 0,
      allowed: 0,
      unit: "",
      margin: 0,
      status: "Not evaluated",
      utilization: 0,
      evidence: "No ramp-rate model is configured. This is not a passed check.",
    },
  );
  return checks;
}
