import type { DraftOrderInput } from "./order-simulation-validation";
import type { SimulatedOrderResult } from "@/types/api";

/** Entered same-side total: replace the edited order; never net BUY against SELL. */
export function combinedEnteredVolume(order: DraftOrderInput, orders: DraftOrderInput[]) {
  const peers = orders.filter(
    (other) =>
      other.id !== order.id && other.interval === order.interval && other.side === order.side,
  );
  const values = [...peers, order].map((item) => Number(item.volume));
  if (
    !peers.length ||
    order.interval < 0 ||
    values.some((value) => !Number.isFinite(value) || value <= 0)
  )
    return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

/** Count executed delivery instants, not formatted times or chart bars. */
export function executedIntervalCount(outcomes: SimulatedOrderResult[]) {
  return new Set(
    outcomes
      .filter((item) => item.execution_status === "EXECUTED")
      .map((item) => Date.parse(item.submitted_order.delivery_start_utc)),
  ).size;
}
