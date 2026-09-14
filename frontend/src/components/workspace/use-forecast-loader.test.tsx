import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useForecastLoader } from "./use-forecast-loader";
import { downloadForecastCsv } from "@/lib/forecast-csv";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/lib/forecast-csv", async (original) => ({
  ...(await original<typeof import("@/lib/forecast-csv")>()),
  downloadForecastCsv: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const points = [{ timestamp_utc: "2026-09-08T22:00:00Z", price_eur_mwh: 0 }];
it("invalidates a candidate when pasted input changes", async () => {
  vi.mocked(api).mockResolvedValue({ points, forecast: {} });
  const { result } = renderHook(() => useForecastLoader("2026-09-09", 60, points));
  await act(() => result.current.upload(new File(["csv"], "test.csv")));
  expect(result.current.preview).toBeDefined();
  act(() => result.current.setPasted("changed"));
  expect(result.current.preview).toBeUndefined();
  expect(result.current.pasted).toBe("changed");
});
it("ignores a pending response after the product changes", async () => {
  // Resolve the old hourly upload only after switching to quarters: it must not
  // become an applicable preview for the new delivery grid.
  let finish!: (value: unknown) => void;
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const { result, rerender } = renderHook(
    ({ minutes }) => useForecastLoader("2026-09-09", minutes, points),
    { initialProps: { minutes: 60 } },
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.upload(new File(["csv"], "test.csv"));
  });
  rerender({ minutes: 15 });
  await act(async () => {
    finish({ points, forecast: {} });
    await pending;
  });
  expect(result.current.preview).toBeUndefined();
});
it("downloads a filled example without replacing the forecast or creating a preview", async () => {
  vi.mocked(api).mockImplementation(
    async (path) => (path.includes("providers") ? { items: [] } : { points }) as never,
  );
  const { result } = renderHook(() => useForecastLoader("2026-09-09", 60, points));
  await act(() => result.current.demo(true));
  expect(downloadForecastCsv).toHaveBeenCalledWith(
    "delivery_start,price_eur_mwh\r\n2026-09-08T22:00:00Z,0\r\n",
    "DA-forecast-2026-09-09-60min-example.csv",
  );
  expect(result.current.preview).toBeUndefined();
});
it("preserves structured row issues and ignores an older upload response", async () => {
  let finishOld!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path) => {
    if (path.includes("providers")) return Promise.resolve({ items: [] }) as never;
    return new Promise((resolve) => {
      finishOld = resolve;
    }) as never;
  });
  const { result } = renderHook(() => useForecastLoader("2026-09-09", 60, points));
  let first!: Promise<void>;
  act(() => {
    first = result.current.upload(new File(["old"], "old.csv"));
  });
  const issues = [
    { code: "missing_price", field: "price_eur_mwh", row: 2, message: "Enter a price." },
  ];
  vi.mocked(api).mockRejectedValueOnce(new ApiError("1 price is missing", issues));
  await act(() => result.current.upload(new File(["blank"], "blank.csv")));
  expect(result.current.issues).toEqual(issues);
  await act(async () => {
    finishOld({ points, forecast: {} });
    await first;
  });
  expect(result.current.preview).toBeUndefined();
  expect(result.current.filename).toBe("blank.csv");
  await waitFor(() => expect(result.current.busy).toBe(false));
});
