import type { Draft } from "./workspace-types";
/** Preserve the original forecast and count adjustments against that immutable baseline. */
export function patchDraft(current: Draft | undefined, patch: Partial<Draft>): Draft | undefined {
  // An empty delivery grid is not a zero-price baseline. The first complete entry
  // becomes the baseline; subsequent changes compare against that saved forecast.
  const baseline =
    current?.forecast?.original_price_values ??
    (current?.prices.every((price) => price.trim() && Number.isFinite(Number(price)))
      ? current.prices.map(Number)
      : patch.prices?.map(Number));
  return current
    ? {
        ...current,
        ...patch,
        forecast:
          patch.forecast ??
          (patch.prices
            ? {
                ...current.forecast,
                source_type: current.forecast?.source_type ?? "manual",
                source_name:
                  current.forecast?.version === "pending"
                    ? "Entered Day-Ahead forecast"
                    : (current.forecast?.source_name ?? "Entered Day-Ahead forecast"),
                adjusted_intervals: patch.prices.filter((p, i) => Number(p) !== baseline?.[i])
                  .length,
                original_price_values: baseline,
                version:
                  current.forecast?.version === "pending"
                    ? "workspace-edited"
                    : (current.forecast?.version ?? "workspace-edited"),
                bidding_zone: current.market.bidding_zone,
              }
            : current.forecast),
      }
    : current;
}
