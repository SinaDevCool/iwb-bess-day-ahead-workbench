import type { DraftOrderInput } from "@/lib/order-simulation-validation";
import type { SubmittedOrder } from "@/types/api";
import type { Draft, Point } from "./workspace-types";
/** Pure adapters preserve string drafts until submission; no persistence or network calls. */
export const identity = (draft: Draft) => JSON.stringify(draft);
export const id = () => crypto.randomUUID();
export const fromOrders = (orders: SubmittedOrder[], points: Point[]): DraftOrderInput[] =>
  orders.map((o) => ({
    id: o.client_order_id,
    interval: points.findIndex(
      (p) => Date.parse(p.timestamp_utc) === Date.parse(o.delivery_start_utc),
    ),
    side: o.side,
    orderType: o.order_type,
    volume: String(o.volume_mw),
    limit: o.limit_price_eur_mwh == null ? "" : String(o.limit_price_eur_mwh),
  }));
export function examples(): DraftOrderInput[] {
  return [
    [5, "BUY", "MARKET", 20, ""],
    [6, "BUY", "LIMIT", 20, "40"],
    [18, "SELL", "MARKET", 15, ""],
    [19, "SELL", "LIMIT", 15, "100"],
  ].map(([interval, side, orderType, volume, limit]) => ({
    id: id(),
    interval: Number(interval),
    side: side as "BUY" | "SELL",
    orderType: orderType as "MARKET" | "LIMIT",
    volume: String(volume),
    limit: String(limit),
  }));
}

/** Serialize only the submitted draft, never the currently displayed saved result. */
export const requestBody = (snapshot: Draft) => ({
  delivery_date: snapshot.date,
  battery: snapshot.battery,
  market: snapshot.market,
  price_values: snapshot.prices.map(Number),
  forecast: snapshot.forecast ?? {
    source_type: "manual",
    source_name: "Entered Day-Ahead forecast",
    version: `workspace-${snapshot.date}`,
    bidding_zone: snapshot.market.bidding_zone,
  },
});
