import { expect, it } from "vitest";
import { proposalKey } from "./proposal-key";
import { patchDraft } from "./workspace-draft";
import type { Draft } from "./workspace-types";

const draft = {
  date: "2026-09-09",
  prices: ["40", "80"],
  market: { bidding_zone: "CH" },
  battery: {},
  orders: [],
} as unknown as Draft;
const policy = {
  risk: "expected_value",
  horizon: "minimum_reserve",
  terminal: "55",
  weights: ["20", "60", "20"],
  lookahead: "4",
};

it("proposal validity depends on optimizer inputs, not entered orders or provenance links", () => {
  const key = proposalKey(draft, policy);
  expect(
    proposalKey(
      { ...draft, orders: [{ id: "new" }] as Draft["orders"], sourceProposalId: "sim-old" },
      policy,
    ),
  ).toBe(key);
  expect(proposalKey({ ...draft, prices: ["41", "80"] }, policy)).not.toBe(key);
  expect(proposalKey(draft, { ...policy, risk: "downside_protected" })).not.toBe(key);
});

it("first valid manual forecast establishes its baseline without treating blanks as zero", () => {
  const updated = patchDraft({ ...draft, prices: ["", ""] }, { prices: ["40", "80"] })!;
  expect(updated.forecast?.original_price_values).toEqual([40, 80]);
  expect(updated.forecast?.adjusted_intervals).toBe(0);
});

it("does not treat a blank forecast as the same proposal input as zero", () => {
  expect(proposalKey({ ...draft, prices: ["", "80"] }, policy)).not.toBe(
    proposalKey({ ...draft, prices: ["0", "80"] }, policy),
  );
});
