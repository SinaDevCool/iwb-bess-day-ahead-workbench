import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { SubmittedOrder } from "@/types/api";
import { OrderSuggestionsTable } from "./order-suggestions-table";
import type { SelectionResult } from "./suggestion-checks";

afterEach(cleanup);
const orders: SubmittedOrder[] = [0, 1].map((i) => ({
  client_order_id: String(i),
  delivery_start_utc: `2026-09-09T0${i}:00:00Z`,
  side: "BUY",
  order_type: "LIMIT",
  volume_mw: 10,
  limit_price_eur_mwh: 40,
}));
const result: SelectionResult = {
  feasible: false,
  contribution_eur: 0,
  improvement_eur: 0,
  issues: [],
  interval_issues: orders.map((o) => ({
    issue_id: o.client_order_id,
    code: "maximum_soc",
    message: "Too much energy",
    delivery_start_utc: o.delivery_start_utc,
    existing_orders: [{ ...o, client_order_id: "manual", volume_mw: 35 }],
    selected_order_ids: [o.client_order_id],
    observed_value: 95,
    configured_limit: 90,
    unit: "MWh",
  })),
  order_checks: orders.map((o) => ({
    order_id: o.client_order_id,
    execution_status: "PHYSICALLY_INFEASIBLE",
    reason_code: "MAXIMUM_SOC",
    issue_ids: [o.client_order_id],
    after_exclusion: false,
  })),
};
const props = {
  orders,
  selected: ["0", "1"],
  result,
  minutes: 60,
  disabled: false,
  stale: false,
  failed: false,
  change: () => {},
};

it("opens one compact explanation and attributes the combined batch", () => {
  render(<OrderSuggestionsTable {...props} />);
  const warnings = screen.getAllByRole("button", { name: /SoC limit/ });
  fireEvent.click(warnings[0]);
  expect(screen.getByText(/existing BUY 35 MW/)).toBeInTheDocument();
  fireEvent.click(warnings[1]);
  expect(screen.getAllByText(/existing BUY 35 MW/)).toHaveLength(1);
  expect(warnings[0]).toHaveAttribute("aria-expanded", "false");
});

it("removes evidence during rechecking and leaves unselected rows neutral", () => {
  const view = render(<OrderSuggestionsTable {...props} />);
  fireEvent.click(screen.getAllByRole("button", { name: /SoC limit/ })[0]);
  view.rerender(<OrderSuggestionsTable {...props} selected={["1"]} result={undefined} />);
  expect(screen.queryByText(/existing BUY/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Not selected")).toBeInTheDocument();
  expect(screen.getByLabelText("Checking selection")).toBeInTheDocument();
});

it("does not mark downstream execution as unconditionally feasible", () => {
  render(
    <OrderSuggestionsTable
      {...props}
      result={{
        ...result,
        interval_issues: [],
        order_checks: [
          {
            order_id: "0",
            execution_status: "EXECUTED",
            reason_code: "",
            issue_ids: [],
            after_exclusion: true,
          },
          {
            order_id: "1",
            execution_status: "EXECUTED",
            reason_code: "",
            issue_ids: [],
            after_exclusion: false,
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Recheck")).toBeInTheDocument();
  expect(screen.getAllByLabelText("Fits selected schedule")).toHaveLength(1);
});
