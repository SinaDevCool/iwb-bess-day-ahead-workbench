import { expect, it } from "vitest";
import { ordersForDate } from "./workspace-date-transition";
import type { Draft } from "./workspace-types";

const grid = (start: string, minutes: number, hours = 24) =>
  Array.from({ length: (hours * 60) / minutes }, (_, i) => ({
    timestamp_utc: new Date(Date.parse(start) + i * minutes * 60_000).toISOString(),
  }));
const draft = (minutes: 15 | 60): Draft =>
  ({
    date: "2026-09-09",
    market: { timezone: "Europe/Zurich", product_minutes: minutes },
    points: grid("2026-09-08T22:00:00Z", minutes),
    prices: [],
    battery: {},
    orders: [
      {
        id: "buy",
        interval: (6 * 60) / minutes,
        side: "BUY",
        orderType: "LIMIT",
        volume: "20",
        limit: "40",
      },
      {
        id: "sell",
        interval: (18 * 60) / minutes,
        side: "SELL",
        orderType: "MARKET",
        volume: "15",
        limit: "",
      },
    ],
  }) as unknown as Draft;

it.each([15, 60] as const)(
  "preserves all order fields and correct delivery slots for %s minutes",
  (minutes) => {
    const before = draft(minutes);
    const next = grid("2026-09-14T22:00:00Z", minutes);
    const orders = ordersForDate(before, next);
    expect(orders).toEqual(before.orders);
    expect(next[orders[0].interval].timestamp_utc).toBe("2026-09-15T04:00:00.000Z");
  },
);
it.each([15, 60] as const)("keeps local time when UTC offsets change for %s minutes", (minutes) => {
  const before = draft(minutes);
  const next = grid("2026-12-14T23:00:00Z", minutes);
  const orders = ordersForDate(before, next);
  expect(next[orders[0].interval].timestamp_utc).toBe("2026-12-15T05:00:00.000Z");
});
it.each([15, 60] as const)(
  "rejects missing and ambiguous DST slots atomically for %s minutes",
  (minutes) => {
    const before = draft(minutes);
    before.orders[0].interval = (2 * 60) / minutes;
    const original = JSON.stringify(before);
    expect(() => ordersForDate(before, grid("2026-03-28T23:00:00Z", minutes, 23))).toThrow(
      "Your inputs have not changed",
    );
    expect(() => ordersForDate(before, grid("2026-10-24T22:00:00Z", minutes, 25))).toThrow(
      "Your inputs have not changed",
    );
    expect(JSON.stringify(before)).toBe(original);
  },
);
