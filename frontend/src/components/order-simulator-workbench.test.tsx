import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedWorkbench } from "./workspace/order-workspace";

const battery = {
  capacity_mwh: 100,
  max_charge_power_mw: 50,
  max_discharge_power_mw: 50,
  initial_soc_mwh: 50,
  min_soc_mwh: 10,
  max_soc_mwh: 90,
  target_soc_mwh: 50,
  round_trip_efficiency: 0.9,
  degradation_cost_eur_per_mwh: 3,
  max_equivalent_cycles: 1.5,
  grid_limit_mw: 50,
  unavailable_intervals: [],
};
const market = {
  market_name: "Swiss Day-Ahead",
  bidding_zone: "CH",
  currency: "EUR",
  timezone: "Europe/Zurich",
  product_minutes: 60,
  gate_closure_local: "12:00",
  volume_increment_mw: 0.1,
  price_increment_eur_mwh: 0.01,
  min_price_eur_mwh: -500,
  max_price_eur_mwh: 4000,
  exchange_fee_eur_per_mwh: 0,
  exchange_fee_policy: "excluded",
  clearing_fee_eur_per_mwh: 0.015,
  assumptions_unverified: true,
};
const points = Array.from({ length: 24 }, (_, index) => ({
  timestamp_utc: new Date(Date.UTC(2026, 8, 8, 22 + index)).toISOString(),
  price_eur_mwh: 30 + index,
}));

vi.mock("./dispatch-chart", () => ({
  ForecastPlot: () => <div>Forecast chart</div>,
  DispatchChart: () => <div>Schedule charts</div>,
}));
const response = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const result = {
  simulation_id: "test-run",
  run_type: "ORDER_SIMULATION",
  created_at_utc: "2026-09-09T00:00:00Z",
  delivery_date: "2026-09-09",
  battery,
  market,
  forecast: {
    source_type: "manual",
    source_name: "Entered",
    version: "1",
    bidding_zone: "CH",
  },
  forecast_points: points,
  submitted_orders: [],
  order_results: [],
  dispatch: [],
  validation: { status: "passed", findings: [] },
  summary: {
    submitted_order_count: 0,
    executed_order_count: 0,
    not_executed_order_count: 0,
    infeasible_order_count: 0,
    initial_soc_mwh: 50,
    final_soc_mwh: 50,
    net_contribution_eur: 0,
    sales_revenue_eur: 0,
    purchase_cost_eur: 0,
    degradation_cost_eur: 0,
    transaction_fee_eur: 0,
  },
  audit: {},
  submitted_portfolio_feasible: true,
  executed_schedule_feasible: true,
};
describe("OrderSimulatorWorkbench", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    sessionStorage.clear();
    history.replaceState({}, "", "/");
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        response(
          String(input).includes("configuration")
            ? { battery, market }
            : String(input).includes("order-simulations")
              ? result
              : { points },
        ),
      ),
    );
  });
  async function ready(withExamples = true) {
    render(<UnifiedWorkbench />);
    await screen.findByRole("button", { name: "Replace forecast" });
    if (withExamples) {
      fireEvent.click(screen.getByRole("button", { name: "Load example inputs" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
      await screen.findByRole("button", { name: /Edit 05:00–06:00 BUY order/ });
    }
  }
  it("starts with no orders and exposes only the manual simulation journey", async () => {
    await ready(false);
    expect(screen.queryByRole("button", { name: "Generate proposal" })).not.toBeInTheDocument();
    expect(screen.queryByText("Proposal settings")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Physical Validation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Compare Runs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit .* order/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add order" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Simulate orders" }));
    expect(await screen.findByText(/Add at least one Market or Limit order/)).toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/api/order-simulations")),
    ).toBe(false);
  });
  function addOrder() {
    fireEvent.click(screen.getByRole("button", { name: "Add order" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add order" }));
    fireEvent.change(dialog.getByLabelText("Delivery for order 1"), { target: { value: "0" } });
    fireEvent.change(dialog.getByLabelText("Volume for order 1"), { target: { value: "10" } });
    fireEvent.change(dialog.getByLabelText("Limit price for order 1"), { target: { value: "30" } });
    fireEvent.click(dialog.getByRole("button", { name: "Add order" }));
  }
  it("shows the compact forecast and all four orders, with only one editor", async () => {
    await ready();
    expect(screen.getByRole("heading", { name: "BESS Day-Ahead Workbench" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Edit .* order/ })).toHaveLength(4);
    expect(screen.queryByLabelText("Volume for order 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Edit 05:00–06:00 BUY order/ }));
    expect(screen.getByLabelText("Volume for order 1")).toHaveValue(20);
    expect(screen.queryByLabelText("Limit price for order 1")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type for order 1"), {
      target: { value: "LIMIT" },
    });
    expect(screen.getByLabelText("Limit price for order 1")).toBeEnabled();
  });
  it("re-adds the first interval after deleting every order", async () => {
    await ready();
    while (screen.queryAllByRole("button", { name: /Edit .* order/ }).length) {
      fireEvent.click(screen.getAllByRole("button", { name: /Edit .* order/ })[0]);
      fireEvent.click(screen.getByRole("button", { name: /^Remove order / }));
    }
    expect(screen.queryAllByRole("button", { name: /Edit .* order/ })).toHaveLength(0);
    addOrder();
    expect(screen.getAllByRole("button", { name: /Edit 00:00–01:00 BUY order/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^Remove order / }));
    addOrder();
    expect(screen.getAllByRole("button", { name: /Edit 00:00–01:00 BUY order/ })).toHaveLength(1);
  });
  it("preserves edits across views and remounts", async () => {
    await ready();
    addOrder();
    fireEvent.change(screen.getByLabelText("Volume for order 5"), {
      target: { value: "12.3" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Dispatch & Economics" }));
    fireEvent.click(screen.getByRole("link", { name: "Auction Orders" }));
    expect(screen.getByLabelText("Volume for order 5")).toHaveValue(12.3);
    cleanup();
    await ready(false);
    expect(screen.getAllByRole("button", { name: /Edit .* order/ })).toHaveLength(5);
  });
  it("opens the single editor from a non-time cell and keeps timezone out of calculations", async () => {
    await ready();
    const row = screen.getByRole("button", { name: /Edit 05:00–06:00 BUY order/ }).closest("tr")!;
    fireEvent.click(within(row).getByRole("cell", { name: /^Market$/ }));
    expect(screen.getAllByRole("complementary", { name: "Selected order editor" })).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "UTC" },
    });
    expect(screen.getByRole("button", { name: /Edit 03:00–04:00 BUY order/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Volume for order 1")).toHaveValue(20);
    fireEvent.click(screen.getByRole("button", { name: "Simulate orders" }));
    await screen.findByText("No orders entered — idle schedule");
    const call = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, options]) =>
          String(url).endsWith("/api/order-simulations") && options?.method === "POST",
      );
    const submitted = JSON.parse(String(call?.[1]?.body));
    expect(submitted.market.timezone).toBe("Europe/Zurich");
    expect(submitted.price_values).toEqual(points.map((point) => point.price_eur_mwh));
    expect(submitted.orders[0].delivery_start_utc).toBe(points[5].timestamp_utc);
    expect(submitted).not.toHaveProperty("display_timezone");
  });
  it("shows one actionable volume error instead of duplicate helper text", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Edit 05:00–06:00 BUY order/ }));
    fireEvent.change(screen.getByLabelText("Volume for order 1"), { target: { value: "-1" } });
    expect(screen.getByText("Enter a positive volume.")).toBeInTheDocument();
    expect(screen.queryByText("Enter a positive volume in MW")).not.toBeInTheDocument();
  });

  it("does not apply blank forecast cells or treat them as zero", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Edit prices|Review prices/ }));
    fireEvent.change(screen.getByLabelText("Price 00:00"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "Apply prices" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Price 00:00"), {
      target: { value: "-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply prices" }));
    fireEvent.click(screen.getByRole("button", { name: /Edit prices|Review prices/ }));
    expect(screen.getByLabelText("Price 00:00")).toHaveValue(-20);
  });
  it("marks a pending simulation result stale when inputs changed during the request", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Edit 05:00–06:00 BUY order/ }));
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Simulate orders" }));
    fireEvent.change(screen.getByLabelText("Volume for order 1"), { target: { value: "21" } });
    resolve(response(result));
    expect(await screen.findByText(/Previous simulation—inputs changed/)).toBeInTheDocument();
    expect(screen.getByText("Schedule charts")).toBeInTheDocument();
  });

  it("shows a recoverable backend failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Error("Backend offline");
      }),
    );
    render(<UnifiedWorkbench />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Workbench unavailable");
    expect(screen.getByRole("button", { name: "Retry Loading" })).toBeEnabled();
  });
  it("loads a price-free grid, preserves orders on date changes and supports undo", async () => {
    await ready();
    const fetchMock = vi.fn(async () =>
      response({
        points: points.map(({ timestamp_utc }) => ({
          timestamp_utc: new Date(Date.parse(timestamp_utc) + 86_400_000).toISOString(),
        })),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.change(screen.getByLabelText("Delivery date"), { target: { value: "2026-09-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    await screen.findByText("No forecast loaded");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/delivery-grid?"),
      expect.anything(),
    );
    expect(screen.queryAllByRole("button", { name: /Edit .* order/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /Edit prices|Review prices/ }));
    expect(screen.getByLabelText("Price 00:00")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Apply prices" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByRole("button", { name: /Edit .* order/ })).toHaveLength(4);
    expect(screen.getByLabelText("Delivery date")).toHaveValue("2026-09-09");
  });
  it("confirms and cancels example replacement without a blocking browser dialog", async () => {
    await ready();
    addOrder();
    fireEvent.click(screen.getByRole("button", { name: "Load example inputs" }));
    expect(screen.getByRole("dialog", { name: "Confirm input replacement" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel replacement" }));
    expect(screen.getAllByRole("button", { name: /Edit .* order/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Load example inputs" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    await screen.findByRole("button", { name: "Undo" });
    expect(screen.getAllByRole("button", { name: /Edit .* order/ })).toHaveLength(4);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it("does not overwrite newer input edits with a delayed example response", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Edit 05:00–06:00 BUY order/ }));
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load example inputs" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    fireEvent.change(screen.getByLabelText("Volume for order 1"), { target: { value: "21" } });
    resolve(response({ points }));
    await screen.findByText(/Inputs changed while loading/);
    expect(screen.getAllByRole("button", { name: /Edit .* order/ })).toHaveLength(4);
    expect(screen.getByLabelText("Volume for order 1")).toHaveValue(21);
  });
  it("keeps battery labels stable and associates validation descriptions", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit battery settings" }));
    const field = screen.getByRole("spinbutton", { name: "Charge limit MW" });
    fireEvent.change(field, { target: { value: "-1" } });
    expect(field).toHaveAccessibleName("Charge limit MW");
    expect(field).toHaveAccessibleDescription("Charge power must be positive.");
    expect(screen.getByRole("button", { name: "Apply settings" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "50" } });
    expect(screen.getByRole("button", { name: "Apply settings" })).toBeEnabled();
  });
  it("shows percentage efficiency but keeps the backend ratio and stages cancellation", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit battery settings" }));
    expect(screen.getByRole("group", { name: "Battery & connection" })).toBeInTheDocument();
    expect(screen.getByLabelText("Round-trip efficiency %")).toHaveValue(90);
    fireEvent.change(screen.getByLabelText("Round-trip efficiency %"), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit battery settings" }));
    expect(screen.getByLabelText("Round-trip efficiency %")).toHaveValue(90);
    fireEvent.change(screen.getByLabelText("Round-trip efficiency %"), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply settings" }));
    const fetchMock = vi.fn(async () => response(result));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Simulate orders" }));
    await screen.findByText("Schedule charts");
    const init = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(JSON.parse(String(init[1].body)).battery.round_trip_efficiency).toBe(0.95);
  });
  it("keeps forecast actions in the shared footer and discards cancelled edits", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Edit prices|Review prices/ }));
    const field = screen.getByLabelText("Price 00:00");
    fireEvent.change(field, { target: { value: "" } });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Required/);
    expect(
      screen.getByRole("button", { name: "Apply prices" }).closest(".ws-dialog-footer-slot"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard edits" }));
    fireEvent.click(screen.getByRole("button", { name: /Edit prices|Review prices/ }));
    expect(screen.getByLabelText("Price 00:00")).toHaveValue(30);
  });
});
