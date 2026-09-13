import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { OrderSimulation } from "@/types/api";
import { SimulationValidation } from "./simulation-validation";

vi.mock("@/lib/simulation-evidence", () => ({
  simulationChecks: () => [
    {
      label: "Charge power",
      observed: 20,
      allowed: 50,
      unit: "MW",
      margin: 30,
      status: "Headroom",
      utilization: 40,
      evidence: "Peak charging power, not daily average.",
    },
  ],
}));
afterEach(cleanup);

it("opens evidence next to its check and hides it when filtered out", () => {
  render(
    <SimulationValidation
      result={
        {
          executed_schedule_feasible: true,
          submitted_portfolio_feasible: true,
          validation: { findings: [] },
          summary: { submitted_order_count: 0, infeasible_order_count: 0 },
        } as unknown as OrderSimulation
      }
    />,
  );
  const check = screen.getByRole("button", { name: /Charge power 20/ });
  fireEvent.click(check);
  const evidence = document.getElementById(check.getAttribute("aria-controls")!)!;
  expect(check.nextElementSibling).toBe(evidence);
  expect(check).toHaveAttribute("aria-controls", evidence.id);
  expect(evidence).toHaveTextContent("Peak charging power, not daily average.");
  fireEvent.click(screen.getByRole("button", { name: "Issue · 0" }));
  expect(screen.queryByText("Peak charging power, not daily average.")).not.toBeInTheDocument();
});
