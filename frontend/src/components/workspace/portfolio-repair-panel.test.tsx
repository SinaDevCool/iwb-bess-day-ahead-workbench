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
it("allow revision clears a previous keep-original override", async () => {
  vi.mocked(api).mockResolvedValue(ready);
  setup();
  fireEvent.click(screen.getByLabelText(/Allow revision/));
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Feasible under the current forecast");
  fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
  expect(screen.getByLabelText(/Allow revision/)).not.toBeChecked();
  expect(screen.getByText(/This order cannot change/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Allow revision again" }));
  expect(screen.getByLabelText(/Allow revision/)).toBeChecked();
  expect(screen.queryByText(/This order cannot change/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Feasible under the current forecast");
  const body = JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string);
  expect(body.allow_revision_ids).toEqual(["manual"]);
  expect(body.keep_original_ids).toEqual([]);
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeEnabled();
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
  await screen.findByText(/No feasible repair was found with these permissions/);
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

const powerIssue = {
  code: "power_limit",
  message: "Power exceeded",
  existing_orders: [order],
  required_revision_ids: ["manual"],
  side: "BUY",
  observed_value: 60,
  configured_limit: 50,
};
it("shows the required permission once, collapses other orders and preserves evidence after changes", async () => {
  vi.mocked(api).mockResolvedValue({
    ...ready,
    status: "blocked",
    orders: [],
    issues: [powerIssue],
  });
  render(
    <OptimizationDialog
      repairFirst={true}
      close={vi.fn()}
      repair={vi.fn()}
      improve={vi.fn()}
      draft={{
        ...draft,
        orders: [...draft.orders, { ...draft.orders[0], id: "unrelated", volume: "5" }],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByRole("region", { name: "Changes required" });
  expect(screen.getByText("Other protected orders · 1").closest("details")).not.toHaveAttribute(
    "open",
  );
  expect(screen.getByText("Diagnostic details").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("alert")).toHaveTextContent("No feasible repair can keep it unchanged");
  expect(screen.getAllByLabelText(/Allow revision/)).toHaveLength(2);
  fireEvent.click(screen.getAllByLabelText(/Allow revision/)[0]);
  expect(screen.getByRole("status")).toHaveTextContent("Permissions changed. Calculate again.");
  expect(screen.getByRole("region", { name: "Changes required" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
});

it("reports changes rather than checked permissions and omits irrelevant repair price columns", async () => {
  vi.mocked(api).mockResolvedValue({ ...ready, orders: [], issues: [powerIssue] });
  setup();
  fireEvent.click(screen.getByLabelText(/Allow revision/));
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("1 order removed");
  expect(screen.queryByRole("columnheader", { name: /limit/ })).not.toBeInTheDocument();
  expect(screen.getByText("Addresses: power limit.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeEnabled();
  fireEvent.click(screen.getByLabelText("Allow new balancing orders"));
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string).allow_additions).toBe(false);
});

it("treats legacy or group evidence as involvement, not mandatory individual permission", async () => {
  vi.mocked(api).mockResolvedValue({
    ...ready,
    status: "blocked",
    orders: [],
    issues: [
      {
        code: "power_limit",
        message: "Combined power exceeds the limit",
        existing_orders: [order],
      },
    ],
  });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Calculate corrections" }));
  await screen.findByText("Review together · 1");
  expect(screen.queryByRole("region", { name: "Changes required" })).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Review protected orders involved");
  expect(screen.getByRole("button", { name: "Apply corrections" })).toBeDisabled();
});
