import type { OrderSimulation } from "@/types/api";
import { describe, expect, it } from "vitest";
import { intervalAtTime, intervalEvidence } from "./interval-evidence";
describe("shared interval evidence", () => {
  it("uses half-open delivery intervals, never inventing an interval at day end", () => {
    expect(intervalAtTime([0, 60], 60, 59)).toBe(0);
    expect(intervalAtTime([0, 60], 60, 60)).toBe(1);
    expect(intervalAtTime([0, 60], 60, 120)).toBe(-1);
  });
  it("groups multiple orders by normalized time without summing shared SoC", () => {
    const run = {
      market: { product_minutes: 60 },
      battery: { initial_soc_mwh: 50 },
      dispatch: [
        {
          timestamp_utc: "2026-09-09T00:00:00Z",
          soc_mwh: 60,
          interval_pnl_eur: -10,
        },
        {
          timestamp_utc: "2026-09-09T01:00:00Z",
          soc_mwh: 60,
          interval_pnl_eur: 0,
        },
      ],
      order_results: [
        {
          submitted_order: {
            client_order_id: "a",
            delivery_start_utc: "2026-09-09T02:00:00+02:00",
          },
        },
        {
          submitted_order: {
            client_order_id: "b",
            delivery_start_utc: "2026-09-09T00:00:00Z",
          },
        },
      ],
    } as OrderSimulation;
    const rows = intervalEvidence(run);
    expect(rows[0].orders).toHaveLength(2);
    expect(rows[1].orders).toHaveLength(0);
    expect(rows[0].socBefore).toBe(50);
    expect(rows[1].socBefore).toBe(60);
    expect(rows[0].interval_pnl_eur).toBe(-10);
  });
});
