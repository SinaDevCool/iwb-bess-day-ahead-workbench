import type { Battery, Dispatch } from "@/types/api";
import { describe, expect, it } from "vitest";
import { scheduleChartData } from "./dispatch-chart";
import { timeTicks, signedColor, chartColors, grid } from "./schedule/chart-config";
it("shares colors by sign without treating charging as a financial loss", () => {
  expect(signedColor(-25)).toBe(chartColors.negative);
  expect(signedColor(50)).toBe(chartColors.positive);
  // Charging can earn money at negative prices: these must remain independent.
  expect(signedColor(-25)).not.toBe(signedColor(100));
  expect(grid.props.vertical).toBe(true);
  expect(grid.props.syncWithTicks).toBe(true);
});
it("uses sparse aligned guides for normal and DST days at either product duration", () => {
  const start = Date.parse("2026-10-24T22:00:00Z");
  for (const hours of [23, 24, 25]) {
    const end = start + hours * 3600000;
    for (const width of [320, 650, 1000]) {
      const ticks = timeTicks(start, end, width);
      expect(ticks[0]).toBe(start);
      expect(ticks.at(-1)).toBe(end);
      expect(new Set(ticks).size).toBe(ticks.length);
      expect(ticks.length).toBeLessThanOrEqual(width === 320 ? 5 : width === 650 ? 8 : 14);
      expect(ticks.every((tick, i) => i === 0 || tick > ticks[i - 1])).toBe(true);
    }
  }
  expect(timeTicks(start, start)).toEqual([]);
  expect(timeTicks(NaN, start)).toEqual([]);
  expect(timeTicks(start, start + 86400000, 1000)[1] - start).toBe(7200000);
});
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
it("uses the explicit market duration even for a single 15-minute interval", () => {
  const start = Date.parse("2026-10-25T00:00:00Z");
  const data = scheduleChartData(
    [{ timestamp_utc: new Date(start).toISOString(), soc_mwh: 50, power_mw: -10 } as Dispatch],
    { initial_soc_mwh: 47.5 } as Battery,
    15,
  );
  expect(data.end - data.start).toBe(900000);
  expect(data.intervals[0]).toEqual({ x: start + 450000, power: -10 });
  expect(data.evidence[0].socBefore).toBe(47.5);
});
it("keeps repeated daylight-saving local hours distinct using UTC boundaries", () => {
  const rows = ["2026-10-25T00:00:00Z", "2026-10-25T01:00:00Z"].map(
    (timestamp_utc) => ({ timestamp_utc, soc_mwh: 50, power_mw: 0 }) as Dispatch,
  );
  const data = scheduleChartData(rows, { initial_soc_mwh: 50 } as Battery, 60);
  expect(data.evidence[0].id).not.toBe(data.evidence[1].id);
  expect(data.evidence[0].end).toBe(data.evidence[1].start);
});
