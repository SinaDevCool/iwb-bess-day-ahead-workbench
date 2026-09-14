import type { DraftOrderInput } from "@/lib/order-simulation-validation";
import type { Battery, Market, OrderSimulation, Simulation, SubmittedOrder } from "@/types/api";
/** Form drafts retain strings so blank/invalid edits are not silently converted to zero. */
export type Point = { timestamp_utc: string; price_eur_mwh?: number };
export type Draft = {
  date: string;
  battery: Battery;
  market: Market;
  points: Point[];
  prices: string[];
  orders: DraftOrderInput[];
  sourceProposalId?: string;
  suggestionIdentity?: string;
  forecast?: OrderSimulation["forecast"];
};
export type Preview = {
  proposal: Simulation;
  orders: SubmittedOrder[];
  pricing_policy: string;
};
export type View = "orders" | "schedule";
