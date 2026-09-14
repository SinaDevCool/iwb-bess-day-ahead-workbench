import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Market, SimulatedOrderResult } from "@/types/api";
import { OrderTicket } from "./order-ticket";
import { deliveryLabel, orderStatus } from "./order-presentation";

afterEach(cleanup);
const fields = {
  order: {
    id: "test-order-1",
    interval: 0,
    side: "BUY" as const,
    orderType: "LIMIT" as const,
    volume: "10",
    limit: "-10",
  },
  rowIndex: 0,
  points: [{ timestamp_utc: "2026-09-08T22:00:00Z" }],
  prices: ["-10"],
  market: {
    timezone: "Europe/Zurich",
    product_minutes: 15,
    volume_increment_mw: 0.1,
    price_increment_eur_mwh: 0.01,
  } as Market,
  issues: {},
  update: vi.fn(),
  remove: vi.fn(),
  close: vi.fn(),
  locate: vi.fn(),
  stale: false,
};
const rejected = {
  execution_status: "PHYSICALLY_INFEASIBLE",
  reason: "Charge power exceeds the grid limit.",
} as SimulatedOrderResult;

it("separates equal-limit eligibility from a physical rejection", () => {
  render(<OrderTicket {...fields} outcome={rejected} />);
  expect(screen.getByText(/2.5 MWh for this interval/)).toBeInTheDocument();
  const atLimit = screen.getByRole("button", { name: "At limit" });
  fireEvent.focus(atLimit);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Full allocation assumed");
  fireEvent.keyDown(atLimit, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(screen.getByText("Physical constraint")).toBeInTheDocument();
  expect(screen.getByText(rejected.reason)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View battery schedule" })).toBeEnabled();
});

it("does not present old physical evidence as a result of current edits", () => {
  render(<OrderTicket {...fields} outcome={rejected} stale />);
  expect(screen.getByText("Outdated")).toBeInTheDocument();
  expect(screen.queryByText(rejected.reason)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View battery schedule" })).toBeDisabled();
});

it("updates the existing draft callbacks, with no separate saved ticket", () => {
  render(<OrderTicket {...fields} />);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Volume for order 1" }), {
    target: { value: "15" },
  });
  expect(fields.update).toHaveBeenCalledWith("test-order-1", { volume: "15" });
  fireEvent.change(screen.getByRole("combobox", { name: "Type for order 1" }), {
    target: { value: "MARKET" },
  });
  expect(fields.update).toHaveBeenCalledWith("test-order-1", { orderType: "MARKET", limit: "" });
  fireEvent.click(screen.getByRole("button", { name: "Remove order 1" }));
  expect(fields.remove).toHaveBeenCalledWith(fields.order);
});

it("market orders show no limit input and retain the forecast settlement explanation", () => {
  render(<OrderTicket {...fields} order={{ ...fields.order, orderType: "MARKET", limit: "" }} />);
  expect(
    screen.queryByRole("spinbutton", { name: "Limit price for order 1" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/No price limit · forecast/)).toBeInTheDocument();
});

it("uses the sell price direction without presenting it as execution", () => {
  render(<OrderTicket {...fields} order={{ ...fields.order, side: "SELL", limit: "0" }} />);
  expect(screen.getByText("Minimum sell price")).toBeInTheDocument();
  expect(screen.getByText("Price condition not met")).toBeInTheDocument();
  expect(screen.getByText("Not simulated")).toBeInTheDocument();
});

it("announces invalid fields and preserves blank draft input", () => {
  render(
    <OrderTicket
      {...fields}
      order={{ ...fields.order, volume: "" }}
      issues={{ "order.test-order-1.volume": "Enter a volume" }}
    />,
  );
  expect(screen.getByRole("spinbutton", { name: "Volume for order 1" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByText("Enter a volume")).toBeInTheDocument();
});

it("distinguishes the two local autumn delivery hours", () => {
  const a = deliveryLabel("2026-10-25T00:00:00Z", 15, "Europe/Zurich");
  const b = deliveryLabel("2026-10-25T01:00:00Z", 15, "Europe/Zurich");
  expect(a).toContain("02:00 · first");
  expect(b).toContain("02:00 · second");
  expect(a).not.toBe(b);
});

it("status priority prevents stale or invalid orders appearing executed", () => {
  const executed = { execution_status: "EXECUTED" } as SimulatedOrderResult;
  expect(orderStatus(executed, true).label).toBe("Outdated");
  expect(orderStatus(executed, false, true).label).toBe("Check input");
  expect(orderStatus(executed).label).toBe("Executed");
});
