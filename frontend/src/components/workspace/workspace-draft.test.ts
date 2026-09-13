import { describe, expect, it } from "vitest";
import { patchDraft } from "./workspace-draft";
import type { Draft } from "./workspace-types";

describe("draft provenance", () => {
  const original = { prices: ["0", "50"], market: { bidding_zone: "CH" } } as Draft;
  it("counts edits against the original forecast, not the previous edit", () => {
    const first = patchDraft(original, { prices: ["10", "50"] })!;
    expect(first.forecast?.adjusted_intervals).toBe(1);
    const second = patchDraft(first, { prices: ["0", "60"] })!;
    expect(second.forecast?.adjusted_intervals).toBe(1);
    expect(second.forecast?.original_price_values).toEqual([0, 50]);
    expect(original.prices).toEqual(["0", "50"]);
    expect(original.forecast).toBeUndefined();
  });
  it("keeps explicit imported provenance and does not create an absent draft", () => {
    const forecast = {
      source_type: "file" as const,
      source_name: "CSV",
      version: "v1",
      bidding_zone: "CH",
    };
    expect(patchDraft(original, { forecast })?.forecast).toBe(forecast);
    expect(patchDraft(undefined, { prices: [] })).toBeUndefined();
  });
});
