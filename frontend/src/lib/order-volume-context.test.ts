import { expect, it } from "vitest";
import { combinedEnteredVolume, executedIntervalCount } from "./order-volume-context";
import type { DraftOrderInput } from "./order-simulation-validation";
import type { SimulatedOrderResult } from "@/types/api";

const order: DraftOrderInput = {
  id: "a",
  interval: 0,
  side: "BUY",
  orderType: "LIMIT",
  volume: "35",
  limit: "85",
};
it("replaces an edit once and excludes opposite sides and other intervals", () => {
  const others = [
    order,
    { ...order, id: "b", volume: "14.9" },
    { ...order, id: "c", side: "SELL" as const },
    { ...order, id: "d", interval: 1 },
  ];
  expect(combinedEnteredVolume(order, others)).toBe(49.9);
  expect(combinedEnteredVolume({ ...order, volume: "30" }, others)).toBe(44.9);
  expect(combinedEnteredVolume({ ...order, volume: "" }, others)).toBeUndefined();
  expect(combinedEnteredVolume(order, [order])).toBeUndefined();
});
it("counts executed instants, normalizing offsets without merging repeated DST hours", () => {
  const outcomes = [
    ["2026-10-25T02:00:00+02:00", "EXECUTED"],
    ["2026-10-25T00:00:00Z", "EXECUTED"],
    ["2026-10-25T02:00:00+01:00", "EXECUTED"],
    ["2026-10-25T03:00:00Z", "NOT_EXECUTED"],
  ].map(([timestamp, status]) => ({
    execution_status: status,
    submitted_order: { delivery_start_utc: timestamp },
  })) as SimulatedOrderResult[];
  expect(executedIntervalCount(outcomes)).toBe(2);
  expect(executedIntervalCount([])).toBe(0);
});
