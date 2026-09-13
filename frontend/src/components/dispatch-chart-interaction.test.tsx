import type { Battery, Dispatch } from "@/types/api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DispatchChart } from "./dispatch-chart";
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const battery = {
  initial_soc_mwh: 50,
  min_soc_mwh: 10,
  max_soc_mwh: 90,
  capacity_mwh: 100,
  max_charge_power_mw: 50,
  max_discharge_power_mw: 50,
} as Battery;
const rows = [
  {
    timestamp_utc: "2026-09-09T00:00:00Z",
    price_eur_mwh: 50,
    action: "idle",
    power_mw: 0,
    soc_mwh: 50,
    interval_pnl_eur: 0,
  },
  {
    timestamp_utc: "2026-09-09T01:00:00Z",
    price_eur_mwh: 30,
    action: "charge",
    power_mw: -10,
    soc_mwh: 59.49,
    interval_pnl_eur: -310,
  },
] as Dispatch[];
it("selects and pins a direct click without any prior hover", () => {
  const selected = vi.fn();
  render(<DispatchChart rows={rows} battery={battery} onSelectInterval={selected} />);
  const track = screen.getByRole("img", { name: "Day-Ahead price forecast" });
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 284,
    right: 284,
    top: 0,
    bottom: 170,
    height: 170,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.click(track, { clientX: 210 });
  expect(selected).toHaveBeenLastCalledWith("2026-09-09T01:00:00.000Z");
  expect(screen.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("group")).toHaveTextContent("-€310.00");
  fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
  expect(screen.getByRole("button", { name: "Pin interval" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
it("supports keyboard selection and safely handles an empty schedule", () => {
  const selected = vi.fn();
  const view = render(<DispatchChart rows={rows} battery={battery} onSelectInterval={selected} />);
  fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" });
  expect(selected).toHaveBeenLastCalledWith("2026-09-09T00:00:00.000Z");
  fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Unpin" })).not.toBeInTheDocument();
  view.rerender(<DispatchChart rows={[]} battery={battery} />);
  expect(() => fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" })).not.toThrow();
});
