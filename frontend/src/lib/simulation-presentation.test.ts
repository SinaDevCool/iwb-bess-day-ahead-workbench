import { describe, expect, it } from "vitest";
import type { OrderSimulation } from "@/types/api";
import { simulationPresentation } from "./simulation-presentation";
import { priceCondition } from "./order-simulation-validation";
import cases from "../../../tests/fixtures/price_conditions.json";

const result = (patch: Partial<OrderSimulation> = {}) =>
  ({
    submitted_portfolio_feasible: true,
    executed_schedule_feasible: true,
    summary: {
      submitted_order_count: 2,
      executed_order_count: 2,
      infeasible_order_count: 0,
      not_executed_order_count: 0,
    },
    ...patch,
  }) as OrderSimulation;

describe("consistent simulation interpretation", () => {
  it("never calls a filtered portfolio successful", () => {
    const r = result({ submitted_portfolio_feasible: false });
    r.summary.infeasible_order_count = 1;
    expect(simulationPresentation(r)).toMatchObject({
      severity: "failed",
      contributionLabel: "Contribution of remaining schedule",
      portfolioLabel: "Portfolio needs attention",
    });
    expect(simulationPresentation(r).scope).toContain("excluded");
    expect(simulationPresentation(r, true).severity).toBe("neutral");
    expect(simulationPresentation(r, true).title).toContain("Previous result");
  });
  it("keeps reserve failures and empty portfolios distinct", () => {
    expect(
      simulationPresentation(
        result({ submitted_portfolio_feasible: false, executed_schedule_feasible: false }),
      ).severity,
    ).toBe("failed");
    const r = result();
    r.summary.submitted_order_count = 0;
    expect(simulationPresentation(r).title).toContain("No orders");
    expect(simulationPresentation(r).severity).toBe("neutral");
  });
  it("does not classify price rejection as physical failure", () => {
    const r = result();
    r.summary.not_executed_order_count = 1;
    expect(simulationPresentation(r).title).toContain("price conditions");
    expect(simulationPresentation(r).severity).toBe("neutral");
    expect(simulationPresentation(result()).severity).toBe("passed");
  });
  it.each(cases)("agrees with backend for $side at $forecast / $limit", (c) => {
    const preview = priceCondition(c.side as "BUY" | "SELL", c.forecast, c.limit);
    expect(preview.passed).toBe(c.eligible);
    expect(preview.atLimit).toBe(c.forecast === c.limit);
  });
});
