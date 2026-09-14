import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { OrderSimulation } from "@/types/api";
import { SimulationResults } from "./simulation-results";
vi.mock("@/components/dispatch-chart", () => ({ DispatchChart: () => <div>Chart</div> }));
vi.mock("@/components/interval-results-table", () => ({
  IntervalResultsTable: () => <div>Intervals</div>,
}));
afterEach(() => {
  cleanup();
  history.replaceState({}, "", "/");
});
const result = {
  simulation_id: "r",
  submitted_portfolio_feasible: false,
  executed_schedule_feasible: true,
  summary: { infeasible_order_count: 1, submitted_order_count: 1, executed_order_count: 0 },
  order_results: [
    {
      execution_status: "PHYSICALLY_INFEASIBLE",
      submitted_order: { client_order_id: "blocked", delivery_start_utc: "2026-09-09T02:00:00Z" },
    },
  ],
} as OrderSimulation;
it.each(["overview", "detail"])("keeps the correction action for conflicts in %s", (view) => {
  history.replaceState({}, "", `/?scheduleView=${view}`);
  const repair = vi.fn();
  render(
    <SimulationResults
      result={{
        ...result,
        order_results: [
          {
            ...result.order_results[0],
            reason_code: "CONFLICTING_SIDES",
          },
        ],
      }}
      onRepair={repair}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Conflicting order directions");
  fireEvent.click(screen.getByRole("button", { name: "Review corrections →" }));
  expect(repair).toHaveBeenCalledOnce();
});
it.each(["overview", "detail"])("offers direct editing in %s", (view) => {
  history.replaceState({}, "", `/?scheduleView=${view}`);
  const edit = vi.fn();
  render(<SimulationResults result={result} onEditOrder={edit} />);
  expect(screen.getByRole("status")).toHaveTextContent("1 order excluded");
  fireEvent.click(screen.getByRole("button", { name: "Edit order →" }));
  expect(edit).toHaveBeenCalledWith("blocked");
});
it("opens the earliest blocked order, not the first array item", () => {
  const edit = vi.fn();
  const earlier = {
    ...result.order_results[0],
    submitted_order: {
      ...result.order_results[0].submitted_order,
      client_order_id: "early",
      delivery_start_utc: "2026-09-09T01:00:00Z",
    },
  };
  render(
    <SimulationResults
      result={{ ...result, order_results: [...result.order_results, earlier] }}
      onEditOrder={edit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit orders →" }));
  expect(edit).toHaveBeenCalledWith("early");
});
it("reviews current orders without restoring or editing stale inputs", () => {
  const edit = vi.fn(),
    review = vi.fn(),
    restore = vi.fn();
  render(
    <SimulationResults
      result={result}
      stale
      onEditOrder={edit}
      onReviewOrders={review}
      onRestore={restore}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review current orders →" }));
  expect(review).toHaveBeenCalledOnce();
  expect(edit).not.toHaveBeenCalled();
  expect(restore).not.toHaveBeenCalled();
});
it("offers review for schedule-wide failures without inventing a blocked order", () => {
  const review = vi.fn();
  render(
    <SimulationResults
      result={{
        ...result,
        order_results: [],
        summary: { ...result.summary, infeasible_order_count: 0 },
        executed_schedule_feasible: false,
      }}
      onReviewOrders={review}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review orders →" }));
  expect(review).toHaveBeenCalledOnce();
});
