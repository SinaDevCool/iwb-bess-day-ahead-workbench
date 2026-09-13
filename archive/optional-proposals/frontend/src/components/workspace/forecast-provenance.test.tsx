import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ForecastSnapshot } from "./forecast-snapshot";
import { calculationIdentity, identity, restoredResultKey } from "./workspace-adapters";
import { patchDraft } from "./workspace-draft";
import { proposalKey } from "./proposal-key";
import { TimePreference, TimezoneSelector } from "./time-preference";
import type { Draft } from "./workspace-types";
afterEach(cleanup);
const draft = {
  date: "2026-09-09",
  battery: {},
  market: { bidding_zone: "CH" },
  points: [{ timestamp_utc: "2026-09-09T00:00:00Z" }],
  prices: ["40"],
  orders: [],
  forecast: {
    source_type: "file",
    source_name: "CSV",
    version: "v1",
    bidding_zone: "CH",
    updated_at_utc: "2026-09-08T08:00:00Z",
    original_price_values: [40],
  },
} as unknown as Draft;
it("keeps numerical freshness independent from timestamp provenance", () => {
  const other = {
    ...draft,
    forecast: { ...draft.forecast!, updated_at_utc: "2026-09-08T09:00:00Z" },
  };
  expect(identity(other)).not.toBe(identity(draft));
  expect(calculationIdentity(other)).toBe(calculationIdentity(draft));
  expect(calculationIdentity({ ...draft, prices: ["41"] })).not.toBe(calculationIdentity(draft));
  expect(calculationIdentity({ ...draft, prices: [""] })).not.toBe(
    calculationIdentity({ ...draft, prices: ["0"] }),
  );
  expect(restoredResultKey(identity(draft))).toBe(calculationIdentity(draft));
  const policy = {
    risk: "balanced",
    horizon: "minimum_reserve",
    terminal: "50",
    weights: ["20", "60", "20"],
    lookahead: "4",
  };
  expect(proposalKey(draft, policy)).toBe(proposalKey(other, policy));
});
it("records real edits but not a numerically unchanged Apply", () => {
  expect(patchDraft(draft, { prices: ["40.00"] })?.forecast).toBe(draft.forecast);
  const changed = patchDraft(draft, { prices: ["45"] })!;
  expect(changed.forecast?.updated_at_utc).not.toBe(draft.forecast?.updated_at_utc);
  expect(changed.forecast?.original_price_values).toEqual([40]);
  expect(changed.forecast?.adjusted_intervals).toBe(1);
  expect(changed.forecast?.content_hash).toBeUndefined();
});
it("formats recorded metadata in the global timezone without changing the snapshot", () => {
  render(
    <TimePreference>
      <TimezoneSelector />
      <ForecastSnapshot forecast={draft.forecast} />
    </TimePreference>,
  );
  expect(screen.getByText(/Updated in this case:/)).toHaveTextContent("10:00");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "UTC" } });
  expect(screen.getByText(/Updated in this case:/)).toHaveTextContent("08:00");
  expect(draft.forecast?.updated_at_utc).toBe("2026-09-08T08:00:00Z");
});
it("never invents a publication date or describes a preview as applied", () => {
  render(<ForecastSnapshot forecast={draft.forecast} preview />);
  expect(screen.getByText("Preview — not applied")).toBeInTheDocument();
  expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  expect(screen.queryByText(/Updated in this case:/)).not.toBeInTheDocument();
});
