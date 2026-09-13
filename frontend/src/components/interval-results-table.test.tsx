import type { OrderSimulation } from "@/types/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IntervalResultsTable } from "./interval-results-table";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
const result = {
  market: { product_minutes: 60, timezone: "Europe/Zurich" },
  battery: { initial_soc_mwh: 50 },
  dispatch: [
    {
      timestamp_utc: "2026-09-09T00:00:00Z",
      price_eur_mwh: 40,
      action: "charge",
      power_mw: -10,
      soc_mwh: 59,
      interval_pnl_eur: -420,
    },
  ],
  order_results: [
    {
      submitted_order: {
        client_order_id: "a",
        delivery_start_utc: "2026-09-09T00:00:00Z",
        side: "BUY",
        order_type: "MARKET",
        volume_mw: 10,
      },
      execution_status: "EXECUTED",
      executed_volume_mw: 10,
      executed_energy_mwh: 10,
      execution_price_eur_mwh: 40,
      contribution_eur: -420,
      reason: "Market order accepted",
    },
  ],
} as OrderSimulation;
it("shows one schedule row with separate expandable execution evidence", () => {
  const select = vi.fn();
  render(<IntervalResultsTable result={result} onSelect={select} />);
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  fireEvent.click(screen.getByRole("button", { name: /BUY MARKET/ }));
  expect(screen.getByText(/Interval SoC: 50.00 → 59.00/)).toBeInTheDocument();
  expect(screen.getByText(/No price limit/)).toBeInTheDocument();
  expect(select).toHaveBeenCalledWith("2026-09-09T00:00:00.000Z");
});
it("restores column choices without increasing the table width budget", async () => {
  sessionStorage.setItem(
    "iwb-evidence-columns",
    JSON.stringify(["forecast", "power", "soc", "net", "fees"]),
  );
  render(<IntervalResultsTable result={result} />);
  await waitFor(() =>
    expect(screen.getByRole("columnheader", { name: "Fees (€)" })).toBeInTheDocument(),
  );
  expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  expect(screen.queryByRole("columnheader", { name: "Action" })).not.toBeInTheDocument();
});
it("opens idle interval evidence from any ordinary cell and from the delivery button", () => {
  const idle = {
    ...result,
    dispatch: [
      { ...result.dispatch[0], action: "idle", power_mw: 0, soc_mwh: 50, interval_pnl_eur: 0 },
    ],
    order_results: [],
  } as OrderSimulation;
  render(<IntervalResultsTable result={idle} />);
  fireEvent.click(screen.getByText("idle"));
  expect(screen.getByText(/No orders were entered/)).toBeInTheDocument();
  const delivery = screen.getByRole("button", { name: /02:00/ });
  expect(delivery).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(delivery);
  expect(screen.queryByText(/No orders were entered/)).not.toBeInTheDocument();
});
