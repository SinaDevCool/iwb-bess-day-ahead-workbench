import { api } from "@/lib/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ForecastLoader } from "./forecast-loader";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/components/dispatch-chart", () => ({
  ForecastPlot: () => <div>Forecast preview</div>,
}));
vi.mock("./dialog", () => ({
  DialogActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const points = [{ timestamp_utc: "2026-09-08T22:00:00Z", price_eur_mwh: 55 }];
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({
    items: [
      { id: "demo", name: "Demo", connected: true },
      { id: "volue", name: "Volue", connected: false },
    ],
  });
});
it("validates an uploaded file on the server and applies only on confirmation", async () => {
  const apply = vi.fn();
  render(
    <ForecastLoader
      date="2026-09-09"
      minutes={60}
      points={points}
      apply={apply}
      cancel={vi.fn()}
    />,
  );
  await screen.findByText("Volue");
  expect(screen.getByRole("button", { name: "Not connected" })).toBeDisabled();
  const preview = {
    points,
    forecast: {
      source_type: "file",
      source_name: "CSV import",
      content_hash: "verified",
    },
  };
  vi.mocked(api).mockResolvedValueOnce(preview);
  const file = new File(["delivery_start,price_eur_mwh\n2026-09-08T22:00:00Z,55"], "forecast.csv", {
    type: "text/csv",
  });
  fireEvent.change(screen.getByLabelText("Choose CSV file"), {
    target: { files: [file] },
  });
  await screen.findByText(/1\/1 intervals validated/);
  expect(api).toHaveBeenLastCalledWith(
    "/api/forecast/import?delivery_date=2026-09-09&product_minutes=60",
    expect.objectContaining({ method: "POST", body: file }),
  );
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply forecast" }));
  expect(apply).toHaveBeenCalledWith(preview);
});
it("does not replace the forecast when validation fails", async () => {
  const apply = vi.fn();
  render(
    <ForecastLoader
      date="2026-09-09"
      minutes={60}
      points={points}
      apply={apply}
      cancel={vi.fn()}
    />,
  );
  await screen.findByText("Volue");
  vi.mocked(api).mockRejectedValueOnce(new Error("Missing delivery interval"));
  fireEvent.change(screen.getByLabelText("Choose CSV file"), {
    target: { files: [new File(["bad"], "bad.csv")] },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Missing delivery interval"),
  );
  expect(screen.getByRole("button", { name: "Apply forecast" })).toBeDisabled();
  expect(apply).not.toHaveBeenCalled();
});
