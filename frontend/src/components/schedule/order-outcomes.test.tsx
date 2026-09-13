import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Dispatch, SimulatedOrderResult } from "@/types/api";
import { IntervalOrderEvidence } from "./interval-order-evidence";
import { OrderOutcomeStrip } from "./order-outcome-strip";
afterEach(cleanup);
const start = "2026-09-09T00:00:00Z";
function outcome(id: string, status: SimulatedOrderResult["execution_status"]) {
  return {
    submitted_order: {
      client_order_id: id,
      delivery_start_utc: start,
      side: "BUY",
      order_type: "LIMIT",
      volume_mw: 10,
      limit_price_eur_mwh: -5,
    },
    execution_status: status,
    reason: "Backend explanation",
  } as SimulatedOrderResult;
}
it("groups mixed outcomes without losing a physical rejection", () => {
  const select = vi.fn();
  render(
    <OrderOutcomeStrip
      rows={[{ timestamp_utc: start } as Dispatch]}
      orders={[outcome("a", "EXECUTED"), outcome("b", "PHYSICALLY_INFEASIBLE")]}
      zone="Europe/Zurich"
      onSelect={select}
    />,
  );
  const marker = screen.getByRole("button");
  expect(marker).toHaveTextContent("△2");
  fireEvent.click(marker);
  expect(select).toHaveBeenCalledWith(0, "a");
});
it("explains price rejection and retains negative limit prices", () => {
  const edit = vi.fn();
  render(<IntervalOrderEvidence orders={[outcome("a", "NOT_EXECUTED")]} onEdit={edit} />);
  expect(screen.getByText(/Limit -€5.00/)).toBeInTheDocument();
  expect(screen.getByText(/Price not met/)).toHaveTextContent("Backend explanation");
  fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
  expect(edit).toHaveBeenCalledWith("a");
});
it("uses a selector for multiple orders and explains orderless intervals", () => {
  const select = vi.fn();
  const view = render(
    <IntervalOrderEvidence
      orders={[outcome("a", "EXECUTED"), outcome("b", "NOT_EXECUTED")]}
      onSelect={select}
    />,
  );
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
  expect(select).toHaveBeenCalledWith("b");
  view.rerender(<IntervalOrderEvidence orders={[]} />);
  expect(screen.getByText("No orders in this interval.")).toBeInTheDocument();
});
