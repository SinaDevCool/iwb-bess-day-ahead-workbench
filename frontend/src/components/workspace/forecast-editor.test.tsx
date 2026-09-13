import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { ForecastEditor } from "./forecast-editor";
import type { Draft } from "./workspace-types";
vi.mock("@/lib/api", () => ({ api: vi.fn().mockResolvedValue({}) }));
vi.mock("./dialog", () => ({
  DialogActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDialogCloseGuard: vi.fn(),
}));
vi.mock("@/components/dispatch-chart", () => ({
  ForecastPlot: ({ baseline, points }: { baseline: number[]; points: unknown[] }) => (
    <div data-testid="comparison">{JSON.stringify({ baseline, points })}</div>
  ),
}));
afterEach(cleanup);
const draft = {
  date: "2026-09-09",
  market: {
    timezone: "Europe/Zurich",
    product_minutes: 60,
    min_price_eur_mwh: -500,
    max_price_eur_mwh: 4000,
  },
  points: [{ timestamp_utc: "2026-09-08T22:00:00Z" }, { timestamp_utc: "2026-09-08T23:00:00Z" }],
  prices: ["55", "40"],
  forecast: { original_price_values: [50, 40] },
  orders: [],
  battery: {},
} as unknown as Draft;
it("keeps source, opening snapshot and staged edits distinct", () => {
  const apply = vi.fn();
  render(<ForecastEditor draft={draft} apply={apply} cancel={vi.fn()} />);
  const input = screen.getByRole("spinbutton", { name: "Price 00:00" });
  fireEvent.change(input, { target: { value: "60" } });
  expect(screen.getByText("+10")).toBeInTheDocument();
  expect(screen.getByTestId("comparison")).toHaveTextContent('"baseline":[50,40]');
  fireEvent.click(screen.getByRole("button", { name: "Undo edit 00:00" }));
  expect(input).toHaveValue(55);
  fireEvent.click(screen.getByRole("button", { name: "Restore source forecast" }));
  fireEvent.click(screen.getByRole("button", { name: /^Restore$/ }));
  expect(input).toHaveValue(50);
  expect(apply).not.toHaveBeenCalled();
  expect(draft.prices).toEqual(["55", "40"]);
});
it("requires explicit discard and validates before applying", async () => {
  const cancel = vi.fn();
  const apply = vi.fn();
  render(<ForecastEditor draft={draft} apply={apply} cancel={cancel} />);
  const input = screen.getByRole("spinbutton", { name: "Price 00:00" });
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Apply prices" })).toBeDisabled();
  expect(screen.getByTestId("comparison")).toHaveTextContent('"price_eur_mwh":null');
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply prices" }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith(["0", "40"]));
  expect(api).toHaveBeenCalledWith("/api/forecast/validate", expect.anything());
});
