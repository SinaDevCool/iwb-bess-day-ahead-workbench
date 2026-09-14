import type { OrderSimulation } from "@/types/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IntervalResultsTable } from "./interval-results-table";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
const result = {
  simulation_id: "run-a",
  market: { product_minutes: 60, timezone: "Europe/Zurich" },
  battery: { initial_soc_mwh: 50 },
  dispatch: [
    {
      timestamp_utc: "2026-09-09T00:00:00Z",
      price_eur_mwh: 40,
      action: "charge",
      power_mw: -10,
      grid_energy_mwh: -10,
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
      soc_delta_mwh: 9,
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
  expect(screen.getByText(/50.00 → 59.00 MWh/)).toBeInTheDocument();
  expect(screen.getByText(/No limit/)).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Selected interval details" }).closest("table"),
  ).toBeNull();
  expect(
    screen
      .getByRole("table", { name: "Saved schedule and simulated order outcomes" })
      .querySelectorAll("tbody > tr"),
  ).toHaveLength(1);
  expect(select).toHaveBeenCalledWith("2026-09-09T00:00:00.000Z");
  expect(screen.getByText("Grid energy imported")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(screen.queryByText("Grid energy imported")).not.toBeInTheDocument();
});
it.each([15, 60] as const)(
  "keeps %s-minute shared energy separate from per-order deltas",
  (minutes) => {
    const multi = {
      ...result,
      market: { ...result.market, product_minutes: minutes },
      order_results: [
        { ...result.order_results[0], soc_delta_mwh: 6 },
        {
          ...result.order_results[0],
          soc_delta_mwh: 3,
          forecast_price_eur_mwh: 40,
          submitted_order: {
            ...result.order_results[0].submitted_order,
            client_order_id: "b",
            order_type: "LIMIT",
            limit_price_eur_mwh: 40,
          },
        },
      ],
    } as OrderSimulation;
    const { rerender } = render(<IntervalResultsTable result={multi} />);
    fireEvent.click(screen.getByRole("button", { name: /2 orders/ }));
    expect(screen.getByText("+6.00")).toBeInTheDocument();
    expect(screen.getByText("+3.00")).toBeInTheDocument();
    expect(screen.getAllByText("Combined stored energy")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "DA forecast (€/MWh)" })).toHaveClass(
      "numeric",
    );
    const button = screen.getByRole("button", { name: "At limit" });
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("actual allocation may differ");
    rerender(<IntervalResultsTable result={{ ...multi, simulation_id: "run-b" }} />);
    expect(
      screen.queryByRole("region", { name: "Selected interval details" }),
    ).not.toBeInTheDocument();
  },
);
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
