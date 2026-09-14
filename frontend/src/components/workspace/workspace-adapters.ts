import type { DraftOrderInput } from "@/lib/order-simulation-validation";
import type { SubmittedOrder } from "@/types/api";
import type { Draft, Point } from "./workspace-types";
/** Pure adapters preserve string drafts until submission; no persistence or network calls. */
export const identity = (draft: Draft) => JSON.stringify(draft);
/** Calculation freshness excludes provenance; full identity still guards async replacement. */
export const calculationInputs = (draft: Draft) => ({
  date: draft.date,
  battery: draft.battery,
  market: draft.market,
  timestamps: draft.points.map((point) => point.timestamp_utc),
  // Keep blanks invalid, rather than coercing them into zero.
  prices: draft.prices.map((price) => (price.trim() ? Number(price) : null)),
});
export const calculationIdentity = (draft: Draft) =>
  JSON.stringify({
    ...calculationInputs(draft),
    orders: draft.orders.map(({ id, interval, side, orderType, volume, limit }) => ({
      id,
      interval,
      side,
      orderType,
      volume,
      limit,
    })),
  });
/** Old sessions stored the complete draft as their result key. Migrate that key, not live inputs. */
export function restoredResultKey(key: string) {
  try {
    const saved = JSON.parse(key);
    return saved.points && saved.orders ? calculationIdentity(saved) : key;
  } catch {
    return key;
  }
}
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
    origin: o.origin ?? "manual",
    protected: o.protected ?? true,
    generationId: o.generation_id,
  }));
export function examples(minutes: 15 | 60 = 60): DraftOrderInput[] {
  return [
    [5, "BUY", "MARKET", 20, ""],
    [6, "BUY", "LIMIT", 20, "40"],
    [18, "SELL", "MARKET", 15, ""],
    [19, "SELL", "LIMIT", 15, "100"],
  ].flatMap(([interval, side, orderType, volume, limit]) =>
    Array.from({ length: 60 / minutes }, (_, quarter) => ({
      id: id(),
      interval: Number(interval) * (60 / minutes) + quarter,
      side: side as "BUY" | "SELL",
      orderType: orderType as "MARKET" | "LIMIT",
      volume: String(volume),
      limit: String(limit),
    })),
  );
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

/** One serializer for simulation and suggestion baselines. */
export const orderRequest = (snapshot: Draft) => ({
  ...requestBody(snapshot),
  source_proposal_id: snapshot.sourceProposalId,
  orders: snapshot.orders.map((o) => ({
    client_order_id: o.id,
    delivery_start_utc: snapshot.points[o.interval].timestamp_utc,
    side: o.side,
    order_type: o.orderType,
    volume_mw: Number(o.volume),
    limit_price_eur_mwh: o.orderType === "LIMIT" ? Number(o.limit) : null,
    origin: o.origin ?? "manual",
    protected: o.protected ?? true,
    generation_id: o.generationId,
  })),
});
