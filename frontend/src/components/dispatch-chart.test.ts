import type { Battery, Dispatch } from "@/types/api";
import { describe, expect, it } from "vitest";
import { scheduleChartData } from "./dispatch-chart";
describe("schedule time boundaries", () => {
  for (const minutes of [15, 60])
    it("preserves initial and final energy at " + minutes + " minutes", () => {
      const start = Date.parse("2026-09-08T22:00:00Z");
      const rows = [0, 1].map(
        (i) =>
          ({
            timestamp_utc: new Date(start + i * minutes * 60000).toISOString(),
            soc_mwh: 55 + 5 * i,
            power_mw: 10,
          }) as Dispatch,
      );
      const d = scheduleChartData(rows, { initial_soc_mwh: 50 } as Battery);
      expect(d.soc).toEqual([
        { x: start, soc: 50 },
        { x: start + minutes * 60000, soc: 55 },
        { x: start + 2 * minutes * 60000, soc: 60 },
      ]);
      expect(d.intervals[0].x).toBe(start + minutes * 30000);
      expect(d.end).toBe(start + 2 * minutes * 60000);
    });
});
