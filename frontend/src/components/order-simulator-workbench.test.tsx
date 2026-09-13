import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderSimulatorWorkbench } from "./order-simulator-workbench";

const battery = {
  capacity_mwh: 100, max_charge_power_mw: 50, max_discharge_power_mw: 50,
  initial_soc_mwh: 50, min_soc_mwh: 10, max_soc_mwh: 90, target_soc_mwh: 50,
  round_trip_efficiency: .9, degradation_cost_eur_per_mwh: 3,
  max_equivalent_cycles: 1.5, grid_limit_mw: 50, unavailable_intervals: [],
};
const market = {
  market_name: "Swiss Day-Ahead", bidding_zone: "CH", currency: "EUR", timezone: "Europe/Zurich",
  product_minutes: 60, gate_closure_local: "12:00", volume_increment_mw: .1,
  price_increment_eur_mwh: .01, min_price_eur_mwh: -500, max_price_eur_mwh: 4000,
  exchange_fee_eur_per_mwh: 0, exchange_fee_policy: "excluded", clearing_fee_eur_per_mwh: .015,
  assumptions_unverified: true,
};
const points = Array.from({ length: 24 }, (_, index) => ({
  timestamp_utc: new Date(Date.UTC(2026, 8, 8, 22 + index)).toISOString(),
  price_eur_mwh: 30 + index,
}));

describe("OrderSimulatorWorkbench", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("configuration") ? { battery, market } : { points };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  it("loads an hourly forecast and the example Market and Limit orders", async () => {
    render(<OrderSimulatorWorkbench openOptimizer={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Simulate Entered Orders" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("24/24 values")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /Remove order/ })).toHaveLength(4);
    expect(screen.queryByLabelText("Limit price for order 1")).not.toBeInTheDocument();
    expect(screen.getAllByText("Market order")).toHaveLength(2);
    expect(screen.getByLabelText("Limit price for order 2")).toBeEnabled();
  });

  it("switches the limit input when the order type changes and can add an order", async () => {
    render(<OrderSimulatorWorkbench openOptimizer={() => undefined} />);
    await waitFor(() => expect(screen.getByText("24/24 values")).toBeInTheDocument());
    const types = screen.getAllByLabelText(/Type for order/);
    fireEvent.change(types[0], { target: { value: "LIMIT" } });
    expect(screen.getByLabelText("Limit price for order 1")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add Order" }));
    expect(screen.getAllByRole("button", { name: /Remove order/ })).toHaveLength(5);
  });

  it("shows a recoverable error when simulator defaults cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Backend offline"); }));
    render(<OrderSimulatorWorkbench openOptimizer={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Order simulator unavailable");
    expect(screen.getByRole("button", { name: "Retry Loading" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open Dispatch Optimizer" })).toBeEnabled();
  });
});
