import type { Battery, Dispatch } from "@/types/api";
import { projectIntervals } from "./interval-evidence";
/** Plot power at interval centres and SoC at boundaries, including the initial state. */
export function scheduleChartData(rows: Dispatch[], battery: Battery, minutes?: number) {
  const dt = minutes
    ? minutes * 60000
    : rows.length > 1
      ? Date.parse(rows[1].timestamp_utc) - Date.parse(rows[0].timestamp_utc)
      : 3600000;
  const start = rows.length ? Date.parse(rows[0].timestamp_utc) : 0;
  const evidence = projectIntervals(rows, battery, dt / 60000);
  return {
    evidence,
    start,
    end: start + rows.length * dt,
    dt,
    intervals: evidence.map((r) => ({
      x: (r.start + r.end) / 2,
      power: r.power_mw,
    })),
    soc: [
      { x: start, soc: battery.initial_soc_mwh },
      ...evidence.map((r) => ({
        x: r.end,
        soc: r.soc_mwh,
      })),
    ],
  };
}
