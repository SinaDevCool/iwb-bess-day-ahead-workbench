import { describe, expect, it } from "vitest";
import { fromOrders, identity, requestBody } from "./workspace-adapters";
import type { Draft } from "./workspace-types";

describe("workspace adapters", () => {
  it("maps saved orders by timestamp, preserving a zero limit", () => {
    const points = [{ timestamp_utc: "2026-09-09T00:00:00Z", price_eur_mwh: 50 }];
    expect(
      fromOrders(
        [
          {
            client_order_id: "a",
            delivery_start_utc: points[0].timestamp_utc,
            side: "BUY",
            order_type: "LIMIT",
            volume_mw: 2,
            limit_price_eur_mwh: 0,
          },
        ],
        points,
      )[0],
    ).toMatchObject({ interval: 0, volume: "2", limit: "0" });
  });
  it("serializes the draft forecast and preserves the snapshot identity", () => {
    const draft = {
      date: "2026-09-09",
      battery: {},
      market: { bidding_zone: "CH" },
      prices: ["0", "-10"],
      points: [],
      orders: [],
    } as unknown as Draft;
    const before = identity(draft);
    expect(requestBody(draft).price_values).toEqual([0, -10]);
    expect(requestBody(draft).forecast.source_type).toBe("manual");
    expect(identity(draft)).toBe(before);
    expect(identity({ ...draft, prices: ["1", "-10"] })).not.toBe(before);
  });
});
