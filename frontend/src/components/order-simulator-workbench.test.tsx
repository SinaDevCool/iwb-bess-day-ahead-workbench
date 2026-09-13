import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderSimulatorWorkbench } from "./order-simulator-workbench";

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
  async function ready() {
    render(<OrderSimulatorWorkbench openOptimizer={() => undefined} />);
    await screen.findByText("24/24 valid");
  }
  it("shows the compact forecast and all four orders, with only one editor", async () => {
    await ready();
    expect(
      screen.getByRole("heading", { name: "BESS Day-Ahead Simulator" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(4);
    expect(
      screen.queryByLabelText("Volume for order 1"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit 05:00 BUY order" }),
    );
    expect(screen.getByLabelText("Volume for order 1")).toHaveValue(20);
    expect(
      screen.queryByLabelText("Limit price for order 1"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type for order 1"), {
      target: { value: "LIMIT" },
    });
    expect(screen.getByLabelText("Limit price for order 1")).toBeEnabled();
  });
  it("preserves edits across views and remounts", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add order" }));
    fireEvent.change(screen.getByLabelText("Volume for order 5"), {
      target: { value: "12.3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Battery schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Inputs" }));
    expect(screen.getByLabelText("Volume for order 5")).toHaveValue(12.3);
    cleanup();
    await ready();
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(5);
  });
  it("does not apply blank forecast cells or treat them as zero", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit prices" }));
    fireEvent.change(
      screen.getByLabelText("Price " + points[0].timestamp_utc),
      { target: { value: "" } },
    );
    expect(screen.getByRole("button", { name: "Apply prices" })).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText("Price " + points[0].timestamp_utc),
      { target: { value: "-20" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply prices" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit prices" }));
    expect(
      screen.getByLabelText("Price " + points[0].timestamp_utc),
    ).toHaveValue(-20);
  });
  it("marks a pending simulation result stale when inputs changed during the request", async () => {
    await ready();
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
    fireEvent.click(screen.getByRole("button", { name: "Simulate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add order" }));
    resolve(response(result));
    expect(
      await screen.findByText(/Inputs changed. The displayed result/),
    ).toBeInTheDocument();
    expect(screen.getByText("Schedule charts")).toBeInTheDocument();
  });
  it("requires explicit proposal application and supports undo", async () => {
    await ready();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          proposal: {
            simulation_id: "proposal-1",
            summary: {
              expected_contribution_eur: 100,
              proposal_terminal_soc_mwh: 50,
            },
          },
          orders: [
            {
              client_order_id: "new",
              delivery_start_utc: points[0].timestamp_utc,
              side: "BUY",
              order_type: "LIMIT",
              volume_mw: 10,
              limit_price_eur_mwh: 30,
            },
          ],
          pricing_policy: "Forecast-derived",
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByRole("button", { name: "Apply proposal" });
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/, hidden: true }),
    ).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Apply proposal" }));
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(4);
  });
  it("shows a recoverable backend failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Error("Backend offline");
      }),
    );
    render(<OrderSimulatorWorkbench openOptimizer={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Order simulator unavailable",
    );
    expect(screen.getByRole("button", { name: "Retry Loading" })).toBeEnabled();
  });
  it("confirms and cancels example replacement without a blocking browser dialog", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add order" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Load example inputs" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Confirm input replacement" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel replacement" }));
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(5);
    fireEvent.click(
      screen.getByRole("button", { name: "Load example inputs" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm replacement" }),
    );
    await screen.findByRole("button", { name: "Undo" });
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(4);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it("does not overwrite newer input edits with a delayed example response", async () => {
    await ready();
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
    fireEvent.click(
      screen.getByRole("button", { name: "Load example inputs" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm replacement" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add order" }));
    resolve(response({ points }));
    await screen.findByText(/Inputs changed while loading/);
    expect(
      screen.getAllByRole("button", { name: /Edit .* order/ }),
    ).toHaveLength(5);
  });
  it("keeps battery labels stable and associates validation descriptions", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Battery settings" }));
    const field = screen.getByRole("spinbutton", { name: "Charge limit MW" });
    fireEvent.change(field, { target: { value: "-1" } });
    expect(field).toHaveAccessibleName("Charge limit MW");
    expect(field).toHaveAccessibleDescription("Charge power must be positive.");
    expect(
      screen.getByRole("button", { name: "Apply settings" }),
    ).toBeDisabled();
    fireEvent.change(field, { target: { value: "50" } });
    expect(
      screen.getByRole("button", { name: "Apply settings" }),
    ).toBeEnabled();
  });
  it("shows percentage efficiency but keeps the backend ratio and stages cancellation", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", {name: "Battery settings"}));
    expect(screen.getByRole("group", {name: "Battery & connection"})).toBeInTheDocument();
    expect(screen.getByLabelText("Round-trip efficiency %")).toHaveValue(90);
    fireEvent.change(screen.getByLabelText("Round-trip efficiency %"), {target: {value: "95"}});
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    fireEvent.click(screen.getByRole("button", {name: "Battery settings"}));
    expect(screen.getByLabelText("Round-trip efficiency %")).toHaveValue(90);
    fireEvent.change(screen.getByLabelText("Round-trip efficiency %"), {target: {value: "95"}});
    fireEvent.click(screen.getByRole("button", {name: "Apply settings"}));
    const fetchMock = vi.fn(async () => response(result));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(screen.getByRole("button", {name: "Simulate"}));
    await screen.findByText("Schedule charts");
    const init = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(JSON.parse(String(init[1].body)).battery.round_trip_efficiency).toBe(0.95);
  });
  it("keeps forecast actions in the shared footer and discards cancelled edits", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", {name: "Edit prices"}));
    const field = screen.getByLabelText("Price " + points[0].timestamp_utc);
    fireEvent.change(field, {target: {value: ""}});
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Required/);
    expect(screen.getByRole("button", {name: "Apply prices"}).closest(".ws-dialog-footer-slot")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    fireEvent.click(screen.getByRole("button", {name: "Edit prices"}));
    expect(screen.getByLabelText("Price " + points[0].timestamp_utc)).toHaveValue(30);
  });
  it("ignores a hidden terminal value when switching to minimum reserve", async () => {
    await ready();
    const bodies: string[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return response({
          proposal: {
            simulation_id: "p",
            summary: {
              expected_contribution_eur: 0,
              proposal_terminal_soc_mwh: 50,
            },
          },
          orders: [],
          pricing_policy: "Forecast-derived",
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Generate proposal" }));
    fireEvent.change(screen.getByLabelText("End-of-day policy"), {
      target: { value: "terminal_value" },
    });
    fireEvent.change(screen.getByLabelText("Terminal value €/MWh"), {
      target: { value: "-1" },
    });
    fireEvent.change(screen.getByLabelText("End-of-day policy"), {
      target: { value: "minimum_reserve" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByRole("button", { name: "Apply proposal" });
    expect(JSON.parse(bodies[0]).terminal_value_eur_per_mwh).toBe(0);
  });
});
