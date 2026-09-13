import type { Draft, Point } from "./workspace-types";

/** Change interval resolution without silently losing orders or altering their energy.
 * UTC overlap also handles the short and long daylight-saving delivery days.
 * Coarsening is allowed only when all constituent inputs are identical.
 */
export function changeResolution(draft: Draft, points: Point[], minutes: 15 | 60): Partial<Draft> {
  const oldMs = draft.market.product_minutes * 60_000;
  const newMs = minutes * 60_000;
  const orders: Draft["orders"] = [];
  const prices: string[] = [];
  const unavailable: number[] = [];
  const signature = (index: number) =>
    JSON.stringify(
      draft.orders
        .filter((order) => order.interval === index)
        .map(({ side, orderType, volume, limit }) => ({ side, orderType, volume, limit }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  points.forEach((point, index) => {
    const start = Date.parse(point.timestamp_utc);
    const overlaps = draft.points.flatMap((old, i) => {
      const oldStart = Date.parse(old.timestamp_utc);
      return oldStart < start + newMs && oldStart + oldMs > start ? [i] : [];
    });
    if (!overlaps.length) throw new Error("The new delivery grid does not match the current day.");
    const first = overlaps[0];
    if (
      overlaps.some(
        (i) =>
          draft.prices[i] !== draft.prices[first] ||
          signature(i) !== signature(first) ||
          draft.battery.unavailable_intervals.includes(i) !==
            draft.battery.unavailable_intervals.includes(first),
      )
    ) {
      throw new Error(
        "Cannot merge different quarter-hour prices, orders or availability into one hour. Keep 15 minutes or make the four quarters identical first. Your inputs have not changed.",
      );
    }
    prices.push(draft.prices[first] ?? "");
    if (draft.battery.unavailable_intervals.includes(first)) unavailable.push(index);
    draft.orders
      .filter((order) => order.interval === first)
      .forEach((order) => {
        orders.push({ ...order, id: crypto.randomUUID(), interval: index });
      });
  });
  return {
    points,
    prices,
    orders,
    market: { ...draft.market, product_minutes: minutes },
    battery: { ...draft.battery, unavailable_intervals: unavailable },
    forecast: {
      ...draft.forecast,
      source_type: "manual",
      source_name: `${(draft.forecast?.source_name ?? "Entered forecast").replace(/(?: · resampled)+$/, "")} · resampled`,
      version: `resampled-${minutes}`,
      bidding_zone: draft.market.bidding_zone,
    },
    sourceProposalId: undefined,
  };
}
