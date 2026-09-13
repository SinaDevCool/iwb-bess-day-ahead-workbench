import type { Draft } from "./workspace-types";
/** Preserve the original forecast and count adjustments against that immutable baseline. */
export function patchDraft(current: Draft | undefined, patch: Partial<Draft>): Draft | undefined {
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
                source_name: current.forecast?.source_name ?? "Entered Day-Ahead forecast",
                adjusted_intervals: patch.prices.filter(
                  (p, i) =>
                    Number(p) !==
                    (current.forecast?.original_price_values ?? current.prices.map(Number))[i],
                ).length,
                original_price_values:
                  current.forecast?.original_price_values ?? current.prices.map(Number),
                version: current.forecast?.version ?? "workspace-edited",
                bidding_zone: current.market.bidding_zone,
              }
            : current.forecast),
      }
    : current;
}
