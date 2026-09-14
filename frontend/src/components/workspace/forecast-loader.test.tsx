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
it("switches methods, reviews an example, and returns without applying", async () => {
  vi.mocked(api).mockResolvedValue({ points });
  const apply = vi.fn(),
    cancel = vi.fn();
  render(
    <ForecastLoader date="2026-09-09" minutes={60} points={points} apply={apply} cancel={cancel} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Paste CSV" }));
  expect(screen.queryByLabelText("Choose CSV file")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Paste forecast CSV"), { target: { value: "my csv" } });
  fireEvent.click(screen.getByRole("button", { name: "Example data" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview example" }));
  await screen.findByText(/Ready to use/);
  expect(screen.queryByRole("button", { name: "Upload CSV" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Choose another source" }));
  expect(screen.queryByRole("button", { name: "Apply forecast" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Paste CSV" }));
  expect(screen.getByLabelText("Paste forecast CSV")).toHaveValue("my csv");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
});
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
  expect(api).not.toHaveBeenCalled();
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
  await screen.findByText(/Ready to use/);
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
  vi.mocked(api).mockRejectedValueOnce(new Error("Missing delivery interval"));
  fireEvent.change(screen.getByLabelText("Choose CSV file"), {
    target: { files: [new File(["bad"], "bad.csv")] },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Missing delivery interval"),
  );
  expect(screen.queryByRole("button", { name: "Apply forecast" })).not.toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});
