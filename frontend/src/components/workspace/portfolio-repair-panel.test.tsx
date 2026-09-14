import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { OptimizationDialog } from "./optimization-dialog";
import type { Draft } from "./workspace-types";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const draft = {
  date: "2026-09-09",
  battery: {},
  market: { product_minutes: 60 },
  points: [{ timestamp_utc: "2026-09-08T22:00:00Z" }],
  prices: ["40"],
  orders: [
    {
      id: "manual",
      interval: 0,
      side: "BUY",
      orderType: "MARKET",
      volume: "60",
      limit: "",
      origin: "manual",
      protected: true,
    },
  ],
} as unknown as Draft;
const order = {
  client_order_id: "manual",
  delivery_start_utc: draft.points[0].timestamp_utc,
  side: "BUY",
  order_type: "MARKET",
  volume_mw: 40,
  origin: "manual",
  protected: true,
};
const ready = {
  input_hash: "hash",
  status: "ready",
  message: "Feasible under the current forecast",
  orders: [order],
  issues: [],
};
function setup() {
  const repair = vi.fn();
  const props = { draft, repairFirst: true, close: vi.fn(), repair, improve: vi.fn() };
  return { ...render(<OptimizationDialog {...props} />), repair, props };
}
it("requires explicit permission, validates before applying and does not simulate", async () => {
  vi.mocked(api).mockResolvedValue(ready);
  const { repair } = setup();
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Allow revision/));
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Feasible under the current forecast");
  const body = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
  expect(body.allow_revision_ids).toEqual(["manual"]);
  expect(body.baseline.orders[0].volume_mw).toBe(60);
  fireEvent.click(screen.getByRole("button", { name: "Apply corrections" }));
  await waitFor(() => expect(repair).toHaveBeenCalledExactlyOnceWith([order]));
  expect(vi.mocked(api).mock.calls[1][0]).toBe("/api/order-suggestions/repair/validate");
});
it("keeping an original invalidates the candidate and requires recalculation", async () => {
  vi.mocked(api).mockResolvedValue(ready);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Feasible under the current forecast");
  fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string).keep_original_ids).toEqual([
    "manual",
  ]);
});
it("blocks a stale candidate", async () => {
  vi.mocked(api).mockResolvedValue(ready);
  const view = setup();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Feasible under the current forecast");
  view.rerender(<OptimizationDialog {...view.props} draft={{ ...draft, prices: ["50"] }} />);
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Inputs changed");
});
it("shows blocked and timeout outcomes without enabling apply", async () => {
  vi.mocked(api).mockResolvedValue({
    ...ready,
    status: "blocked",
    orders: [],
    message: "Review protected orders or settings",
  });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Review protected orders or settings");
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
  vi.mocked(api).mockResolvedValue({
    ...ready,
    status: "timeout",
    orders: [],
    message: "Repair reached its time limit",
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Repair reached its time limit");
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
});
