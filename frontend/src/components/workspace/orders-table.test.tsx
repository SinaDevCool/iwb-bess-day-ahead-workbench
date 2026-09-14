import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { OrderSimulation } from "@/types/api";
import type { Draft } from "./workspace-types";
import { OrdersTable } from "./orders-table";
afterEach(cleanup);
it("marks current physical failures but not outdated draft outcomes", () => {
  const props = {
    draft: {
      orders: [{ id: "a", interval: 0, side: "BUY", orderType: "MARKET", volume: "10", limit: "" }],
      points: [{ timestamp_utc: "2026-09-09T00:00:00Z" }],
      market: { product_minutes: 60 },
    } as Draft,
    result: {
      order_results: [
        { submitted_order: { client_order_id: "a" }, execution_status: "PHYSICALLY_INFEASIBLE" },
      ],
    } as OrderSimulation,
    dirty: false,
    selected: "a",
    issues: {},
    ticket: null,
    wide: true,
    rowRefs: { current: {} },
    select: vi.fn(),
  };
  const { rerender } = render(<OrdersTable {...props} />);
  expect(screen.getByText("Physical constraint").closest("tr")).toHaveClass(
    "physical-rejection",
    "selected",
  );
  rerender(<OrdersTable {...props} dirty />);
  expect(screen.getByText("Outdated").closest("tr")).not.toHaveClass("physical-rejection");
});
