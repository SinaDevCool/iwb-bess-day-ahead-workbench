import type { Draft, Point } from "./workspace-types";

/** Carry draft orders by market-local delivery time, not UTC offset or array index.
 * Refuse ambiguous/missing DST slots atomically so no order is silently lost.
 */
export function ordersForDate(draft: Draft, points: Point[]): Draft["orders"] {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: draft.market.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const labels = (grid: Point[]) => grid.map((p) => formatter.format(new Date(p.timestamp_utc)));
  const before = labels(draft.points);
  const after = labels(points);
  return draft.orders.map((order) => {
    const time = before[order.interval];
    const oldSlots = before.flatMap((label, i) => (label === time ? [i] : []));
    const newSlots = after.flatMap((label, i) => (label === time ? [i] : []));
    if (!time || oldSlots.length !== newSlots.length || !newSlots.length) {
      throw new Error(
        `Cannot transfer the order at ${time ?? "an invalid interval"}: this delivery time is missing or repeated differently on the new date. Adjust that order first. Your inputs have not changed.`,
      );
    }
    return { ...order, interval: newSlots[oldSlots.indexOf(order.interval)] };
  });
}
