import type { Battery, Dispatch } from "@/types/api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DispatchChart } from "./dispatch-chart";
import { chartColors } from "./schedule/chart-config";
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Cell: ({ fill }: { fill: string }) => <span data-testid="chart-cell" data-fill={fill} />,
  ReferenceArea: () => null,
  ReferenceDot: () => null,
  Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: ({ ticks, tick }: { ticks: number[]; tick: unknown }) => (
    <span
      data-testid="time-axis"
      data-ticks={JSON.stringify(ticks)}
      data-tick-enabled={tick !== false}
    />
  ),
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
it("matches bar legends and tooltip accents while preserving positive charging contribution", () => {
  const profitableCharge = [{ ...rows[1], price_eur_mwh: -30, interval_pnl_eur: 270 }];
  const { container } = render(
    <DispatchChart rows={profitableCharge} battery={battery} showContribution />,
  );
  const cells = screen.getAllByTestId("chart-cell");
  const axes = screen.getAllByTestId("time-axis");
  expect(axes).toHaveLength(4);
  expect(new Set(axes.map((axis) => axis.dataset.ticks)).size).toBe(1);
  expect(axes.every((axis) => axis.dataset.tickEnabled === "true")).toBe(true);
  expect(cells.map((cell) => cell.dataset.fill)).toEqual([
    chartColors.negative,
    chartColors.positive,
  ]);
  expect(container.querySelector(".schedule-power i")).toHaveStyle({
    background: chartColors.negative,
  });
  expect(container.querySelector(".schedule-contribution i")).toHaveStyle({
    background: chartColors.positive,
  });
  fireEvent.keyDown(screen.getByRole("img", { name: "Day-Ahead price forecast" }), {
    key: "ArrowRight",
  });
  expect(container.querySelector(".schedule-track-readout.power")).toHaveStyle({
    borderTopColor: chartColors.negative,
  });
  expect(container.querySelector(".schedule-track-readout.contribution")).toHaveStyle({
    borderTopColor: chartColors.positive,
  });
});
function plotBounds(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 0, width: 284 } as DOMRect);
}
it("opens an interval directly without pin controls", () => {
  const selected = vi.fn(),
    details = vi.fn();
  render(
    <DispatchChart
      rows={rows}
      battery={battery}
      onSelectInterval={selected}
      onShowDetails={details}
    />,
  );
  const track = screen.getByRole("img", { name: "Day-Ahead price forecast" });
  plotBounds(track);
  fireEvent.click(track, { clientX: 210 });
  expect(selected).toHaveBeenLastCalledWith("2026-09-09T01:00:00.000Z");
  expect(details).toHaveBeenCalledOnce();
  expect(screen.queryByText(/Unpin|Pin interval|Inspect orders/)).not.toBeInTheDocument();
});
it("supports keyboard inspection, dismissal and empty data", () => {
  const selected = vi.fn();
  const view = render(<DispatchChart rows={rows} battery={battery} onSelectInterval={selected} />);
  const track = screen.getByRole("img", { name: "Day-Ahead price forecast" });
  fireEvent.keyDown(track, { key: "ArrowRight" });
  expect(selected).not.toHaveBeenCalled();
  expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("€50.00/MWh");
  fireEvent.keyDown(track, { key: "ArrowRight" });
  fireEvent.keyDown(track, { key: "Enter" });
  expect(selected).toHaveBeenLastCalledWith("2026-09-09T01:00:00.000Z");
  fireEvent.keyDown(track, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  view.rerender(<DispatchChart rows={[]} battery={battery} />);
  expect(screen.getByText(/No delivery intervals/)).toBeInTheDocument();
});
it("synchronizes all four tooltips including idle values, without committing hover", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const selected = vi.fn();
  render(
    <DispatchChart rows={rows} battery={battery} showContribution onSelectInterval={selected} />,
  );
  const track = screen.getByRole("img", { name: "Day-Ahead price forecast" });
  plotBounds(track);
  fireEvent.pointerMove(track, { clientX: 210 });
  expect(screen.getAllByRole("tooltip")).toHaveLength(4);
  expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("€30.00/MWh");
  expect(screen.getAllByRole("tooltip")[1]).toHaveTextContent("-10.0 MW");
  expect(screen.getAllByRole("tooltip")[2]).toHaveTextContent("Start50.00 MWhEnd59.49 MWh");
  expect(screen.getAllByRole("tooltip")[3]).toHaveTextContent("-€310.00");
  const position = screen.getAllByRole("tooltip")[0].style.left;
  fireEvent.pointerMove(track, { clientX: 90 });
  expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("€50.00/MWh");
  expect(screen.getAllByRole("tooltip")[1]).toHaveTextContent("Idle0.0 MW");
  expect(screen.getAllByRole("tooltip")[0].style.left).not.toBe(position);
  expect(selected).not.toHaveBeenCalled();
  fireEvent.pointerLeave(track);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});
it("honours an external selected interval without requiring an order", () => {
  render(
    <DispatchChart rows={rows} battery={battery} selectedInterval="2026-09-09T00:00:00.000Z" />,
  );
  expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("€50.00/MWh");
});
