import type { OrderSimulation } from "@/types/api";
import { describe, expect, it } from "vitest";
import { simulationChecks } from "./simulation-evidence";

function fixture(): OrderSimulation {
  return {
    battery: {
      capacity_mwh: 100,
      max_charge_power_mw: 50,
      max_discharge_power_mw: 50,
      grid_limit_mw: 50,
      initial_soc_mwh: 50,
      min_soc_mwh: 10,
      max_soc_mwh: 90,
      target_soc_mwh: 50,
      round_trip_efficiency: 1,
      max_equivalent_cycles: 1.5,
      unavailable_intervals: [],
    },
    market: { product_minutes: 60 },
    dispatch: [
      {
        timestamp_utc: "2026-09-09T00:00:00Z",
        interval: 0,
        power_mw: -20,
        soc_mwh: 70,
        action: "charge",
      },
    ],
    forecast_points: [{ timestamp_utc: "2026-09-09T00:00:00Z", price_eur_mwh: 30 }],
    summary: {
      equivalent_cycles: 0.1,
      final_soc_mwh: 70,
      infeasible_order_count: 0,
    },
    validation: { status: "passed", findings: [] },
    submitted_portfolio_feasible: true,
  } as unknown as OrderSimulation; // Only fields consumed by this presentation helper.
}
describe("saved simulation evidence", () => {
  it("shows actual headroom rather than treating all limits as fully used", () => {
    const checks = simulationChecks(fixture());
    expect(checks.find((c) => c.label === "Charge power")).toMatchObject({
      observed: 20,
      allowed: 50,
      margin: 30,
      status: "Headroom",
    });
    expect(checks.find((c) => c.label === "Minimum state of charge")).toMatchObject({
      observed: 50,
      margin: 40,
      status: "Headroom",
    });
    expect(checks.find((c) => c.label === "Energy balance")?.status).toBe("Verified");
    expect(checks.find((c) => c.label === "Ramp rate")?.status).toBe("Not evaluated");
  });
  it("uses the grid-constrained effective power limit", () => {
    const r = fixture();
    r.battery.grid_limit_mw = 20;
    expect(simulationChecks(r)[0]).toMatchObject({
      allowed: 20,
      margin: 0,
      status: "Fully used",
    });
  });
  it("does not hide backend errors behind rounded observations", () => {
    const r = fixture();
    r.validation.findings = [
      { code: "charge_power_limit", severity: "error", message: "Too high" },
    ];
    expect(simulationChecks(r)[0].status).toBe("Issue");
  });
  it("detects a broken time grid and energy balance", () => {
    const r = fixture();
    r.dispatch[0].timestamp_utc = "2026-09-09T01:00:00Z";
    r.dispatch[0].soc_mwh = 80;
    const checks = simulationChecks(r);
    expect(checks.find((c) => c.label === "Interval coverage")?.status).toBe("Issue");
    expect(checks.find((c) => c.label === "Energy balance")?.status).toBe("Issue");
  });
  it("reports a reserve shortfall separately from executed-order count", () => {
    const r = fixture();
    r.summary.final_soc_mwh = 40;
    r.submitted_portfolio_feasible = false;
    const checks = simulationChecks(r);
    expect(checks.find((c) => c.label === "End-of-day reserve")).toMatchObject({
      margin: -10,
      status: "Issue",
    });
    expect(checks.find((c) => c.label === "Submitted order feasibility")?.status).toBe("Issue");
  });
});
