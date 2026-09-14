import { expect, it } from "vitest";
import type { Draft } from "./workspace-types";
import {
  applySuggestions,
  replaceable,
  revisionBaseline,
  revisionRows,
  suggestionIdentity,
} from "./suggestion-revision";
import { calculationIdentity, fromOrders, orderRequest } from "./workspace-adapters";
import { ordersForDate } from "./workspace-date-transition";
import { changeResolution } from "./workspace-duration-transition";
const manual = {
  id: "manual",
  interval: 0,
  side: "BUY" as const,
  orderType: "MARKET" as const,
  volume: "13",
  limit: "",
};
const old = {
  ...manual,
  id: "old",
  interval: 1,
  origin: "suggested" as const,
  protected: false,
  generationId: "g",
};
const draft = {
  date: "2026-09-09",
  prices: ["40", "50"],
  market: { product_minutes: 60, timezone: "Europe/Zurich" },
  battery: { unavailable_intervals: [] },
  points: [{ timestamp_utc: "2026-09-09T00:00:00Z" }, { timestamp_utc: "2026-09-09T01:00:00Z" }],
  orders: [manual, old],
} as unknown as Draft;
const proposed = {
  client_order_id: "new",
  delivery_start_utc: draft.points[1].timestamp_utc,
  side: "BUY" as const,
  order_type: "LIMIT" as const,
  volume_mw: 9,
  limit_price_eur_mwh: 50,
};
it("protects legacy/manual orders and partitions only explicitly unlocked suggestions", () => {
  expect(replaceable(manual)).toBe(false);
  expect(replaceable({ ...manual, id: "suggested-legacy" })).toBe(false);
  expect(revisionBaseline(draft).orders).toEqual([manual]);
  expect(revisionBaseline({ ...draft, orders: [{ ...old, protected: true }] }).orders).toHaveLength(
    1,
  );
});
it("replaces atomically, preserves manual input and does not accumulate duplicates", () => {
  const next = applySuggestions(draft, [proposed], true);
  expect(next.orders[0]).toEqual(manual);
  expect(next.orders).toHaveLength(2);
  expect(next.orders[1]).toMatchObject({
    id: "new",
    volume: "9",
    origin: "suggested",
    protected: false,
  });
  expect(applySuggestions(next, [proposed], true).orders).toHaveLength(2);
  expect(draft.orders).toEqual([manual, old]);
  expect(applySuggestions(draft, [], true).orders).toEqual([manual]);
});
it("does not confuse valid same-interval orders with duplicates", () => {
  expect(
    applySuggestions(
      draft,
      [{ ...proposed, delivery_start_utc: draft.points[0].timestamp_utc }],
      false,
    ).orders,
  ).toHaveLength(3);
});
it("keeps unchanged IDs and reports changes without merging rows", () => {
  const exact = {
    ...proposed,
    order_type: "MARKET" as const,
    limit_price_eur_mwh: null,
    volume_mw: 13,
  };
  expect(applySuggestions(draft, [exact], true).orders[1].id).toBe("old");
  expect(revisionRows([old], [{ ...old, id: "new", volume: "9" }])[0].change).toBe("Updated");
  expect(revisionRows([old], [])[0].change).toBe("Removed");
});
it("metadata affects suggestion freshness but not simulation freshness", () => {
  const locked = { ...draft, orders: [manual, { ...old, protected: true }] };
  expect(calculationIdentity(locked)).toBe(calculationIdentity(draft));
  expect(suggestionIdentity(locked)).not.toBe(suggestionIdentity(draft));
});
it("round-trips metadata through saved submitted orders and session JSON", () => {
  const serialized = orderRequest(draft);
  expect(fromOrders(serialized.orders, draft.points)[1]).toMatchObject(old);
  expect(replaceable(JSON.parse(JSON.stringify(old)))).toBe(true);
});
it("preserves metadata across date and resolution transitions", () => {
  const points = draft.points.map((p) => ({
    timestamp_utc: p.timestamp_utc.replace("09T", "10T"),
  }));
  expect(ordersForDate(draft, points)[1]).toMatchObject(old);
  const quarters = Array.from({ length: 8 }, (_, i) => ({
    timestamp_utc: new Date(Date.parse(draft.points[0].timestamp_utc) + i * 900000).toISOString(),
  }));
  const changed = changeResolution(draft, quarters, 15);
  expect(changed.orders!.filter(replaceable)).toHaveLength(4);
});
