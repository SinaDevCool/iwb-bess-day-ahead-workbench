import type { OrderSimulation } from "@/types/api";
import { boundaryCheck, integrityCheck, integrityStatistics } from "./simulation-check-builders";

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
    r.validation.findings.filter((f) => f.severity === "error").map((f) => f.code),
  );
  const charge = Math.max(0, ...rows.map((x) => -x.power_mw));
  const discharge = Math.max(0, ...rows.map((x) => x.power_mw));
  const soc = [b.initial_soc_mwh, ...rows.map((x) => x.soc_mwh)];
  const checks = [
    boundaryCheck(
      b,
      errors,
      "Charge power",
      charge,
      Math.min(b.max_charge_power_mw, b.grid_limit_mw),
      "MW",
      false,
      ["charge_power_limit", "grid_limit"],
      "Peak charging power across the executed schedule; not average daily utilization. Effective limit is the smaller of charge and grid limits.",
    ),
    boundaryCheck(
      b,
      errors,
      "Discharge power",
      discharge,
      Math.min(b.max_discharge_power_mw, b.grid_limit_mw),
      "MW",
      false,
      ["discharge_power_limit", "grid_limit"],
      "Peak executed discharge power against the effective discharge limit.",
    ),
    boundaryCheck(
      b,
      errors,
      "Grid connection",
      Math.max(charge, discharge),
      b.grid_limit_mw,
      "MW",
      false,
      ["grid_limit"],
      "Largest absolute import or export instruction.",
    ),
    boundaryCheck(
      b,
      errors,
      "Minimum state of charge",
      Math.min(...soc),
      b.min_soc_mwh,
      "MWh",
      true,
      ["soc_below_min"],
      "Lowest stored energy, including initial SoC. Margin = observed minimum minus configured minimum.",
    ),
    boundaryCheck(
      b,
      errors,
      "Maximum state of charge",
      Math.max(...soc),
      b.max_soc_mwh,
      "MWh",
      false,
      ["soc_above_max"],
      "Highest stored energy, including initial SoC.",
    ),
    boundaryCheck(
      b,
      errors,
      "Daily cycle budget",
      r.summary.equivalent_cycles,
      b.max_equivalent_cycles,
      "EFC",
      false,
      ["cycle_limit"],
      "Executed battery throughput divided by twice nominal capacity.",
    ),
    boundaryCheck(
      b,
      errors,
      "End-of-day reserve",
      r.summary.final_soc_mwh,
      b.target_soc_mwh,
      "MWh",
      true,
      ["terminal_soc"],
      "Stored energy after the last delivery interval minus the required reserve.",
    ),
  ];
  const { residual, coverage, unavailable } = integrityStatistics(r);
  checks.push(
    integrityCheck(
      "Energy balance",
      residual,
      0.15,
      "MWh",
      residual <= 0.15 && !errors.has("energy_balance"),
      "SoC[t] = SoC[t−1] + charge × η × duration − discharge ÷ η × duration. Backend reconciliation tolerance: 0.15 MWh.",
    ),
    integrityCheck(
      "Asset availability",
      unavailable,
      0,
      "conflicts",
      unavailable === 0 && !errors.has("unavailable"),
      b.unavailable_intervals.length + " unavailable intervals checked against executed dispatch.",
    ),
    integrityCheck(
      "Interval coverage",
      rows.length,
      r.forecast_points.length,
      "intervals",
      coverage && !errors.has("interval_coverage"),
      "Matches the saved UTC delivery grid, including daylight-saving days.",
    ),
    integrityCheck(
      "Operating mode",
      errors.has("operating_mode") ? 1 : 0,
      0,
      "issues",
      !errors.has("operating_mode"),
      "Backend checks action and signed power; opposite eligible orders in an interval are handled by the simulator's batch policy.",
    ),
    integrityCheck(
      "Submitted order feasibility",
      r.summary.infeasible_order_count,
      0,
      "rejections",
      r.submitted_portfolio_feasible,
      "Checks both physically rejected orders and the resulting schedule, including end-of-day reserve. A reserve shortfall can occur even with zero physically rejected orders. Price eligibility is separate; orders are not silently optimized or partially filled.",
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
