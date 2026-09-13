import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TooltipPosition } from "./tooltip-position";
import { TrackReadout } from "./track-readout";

afterEach(cleanup);

it.each([0, 0.5, 1])("keeps a tooltip inside the plot at fraction %s", (fraction) => {
  render(
    <TooltipPosition.Provider value={{ fraction, width: 400 }}>
      <TrackReadout
        value={{
          interval: "09:00–09:15",
          label: "DA forecast",
          value: "€52.00/MWh",
          tone: "price",
        }}
      />
    </TooltipPosition.Provider>,
  );
  const tooltip = screen.getByRole("tooltip");
  const left = Number.parseFloat(tooltip.style.left);
  expect(left).toBeGreaterThanOrEqual(8);
  expect(left + 236).toBeLessThanOrEqual(392);
  expect(screen.getByText("€52.00/MWh")).toBeInTheDocument();
});

it("labels both energy boundary values without parsing a prose string", () => {
  render(
    <TrackReadout
      value={{
        interval: "09:00–09:15",
        label: "Stored energy",
        tone: "soc",
        rows: [
          { label: "Start", value: "50.00 MWh" },
          { label: "End", value: "52.37 MWh" },
        ],
      }}
    />,
  );
  expect(screen.getByText("Start")).toBeInTheDocument();
  expect(screen.getByText("End")).toBeInTheDocument();
  expect(screen.getByText("52.37 MWh")).toBeInTheDocument();
});

it("renders no floating box when inspection is dismissed", () => {
  render(<TrackReadout />);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
