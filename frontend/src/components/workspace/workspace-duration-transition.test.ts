import { expect, it } from "vitest";
import { changeResolution } from "./workspace-duration-transition";
import type { Draft } from "./workspace-types";

const grid = (minutes: number, count: number, start = "2026-09-08T22:00:00Z") =>
  Array.from({ length: count }, (_, i) => ({
    timestamp_utc: new Date(Date.parse(start) + i * minutes * 60_000).toISOString(),
  }));
const draft = (): Draft =>
  ({
    date: "2026-09-09",
    points: grid(60, 24),
    prices: Array(24).fill("-5"),
    market: { product_minutes: 60, bidding_zone: "CH" },
    battery: { unavailable_intervals: [2] },
    orders: [
      { id: "test", interval: 6, side: "BUY", orderType: "LIMIT", volume: "20", limit: "0" },
    ],
  }) as Draft;
it("preserves forecast, energy and availability when splitting hourly orders", () => {
  const old = draft();
  const next = changeResolution(old, grid(15, 96), 15);
  expect(next.orders).toHaveLength(4);
  expect(new Set(next.orders?.map((o) => o.id)).size).toBe(4);
  expect(next.orders?.map((o) => o.interval)).toEqual([24, 25, 26, 27]);
  expect(next.orders?.reduce((sum, o) => sum + Number(o.volume) * 0.25, 0)).toBe(20);
  expect(next.prices).toEqual(Array(96).fill("-5"));
  expect(next.battery?.unavailable_intervals).toEqual([8, 9, 10, 11]);
  expect(old.orders).toHaveLength(1);
});
it("merges identical quarters back without multiplying MW", () => {
  const old = draft();
  const quarters = { ...old, ...changeResolution(old, grid(15, 96), 15) };
  const back = changeResolution(quarters, old.points, 60);
  expect(back.orders).toHaveLength(1);
  expect(back.orders?.[0]).toMatchObject({ interval: 6, volume: "20", limit: "0" });
});
it("rejects incompatible quarter hours without modifying the draft", () => {
  const old = draft();
  const quarters = { ...old, ...changeResolution(old, grid(15, 96), 15) };
  quarters.prices[0] = "10";
  const before = JSON.stringify(quarters);
  expect(() => changeResolution(quarters, old.points, 60)).toThrow("Cannot merge");
  expect(JSON.stringify(quarters)).toBe(before);
});
it("preserves missing prices and supports the 25-hour DST day", () => {
  const old = draft();
  old.points = grid(60, 25, "2026-10-24T22:00:00Z");
  old.prices = Array(25).fill("");
  const next = changeResolution(old, grid(15, 100, "2026-10-24T22:00:00Z"), 15);
  expect(next.prices).toEqual(Array(100).fill(""));
  expect(next.points).toHaveLength(100);
});
it("resamples original forecast prices and adjustment counts with the same grid", () => {
  const old = draft();
  old.forecast = {
    source_type: "file",
    source_name: "CSV",
    version: "1",
    bidding_zone: "CH",
    original_price_values: Array(24).fill(-5),
    content_hash: "old",
  };
  old.prices[9] = "-10";
  const next = changeResolution(old, grid(15, 96), 15);
  expect(next.forecast?.original_price_values).toEqual(Array(96).fill(-5));
  expect(next.forecast?.adjusted_intervals).toBe(4);
  expect(next.forecast?.content_hash).toBeUndefined();
  const back = changeResolution({ ...old, ...next }, old.points, 60);
  expect(back.forecast?.original_price_values).toEqual(Array(24).fill(-5));
  expect(back.forecast?.adjusted_intervals).toBe(1);
});
