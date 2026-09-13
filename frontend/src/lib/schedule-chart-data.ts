import type { Battery, Dispatch } from "@/types/api";
/** Plot power at interval centres and SoC at boundaries, including the initial state. */
export function scheduleChartData(rows: Dispatch[], battery: Battery) {
  const dt =
    rows.length > 1
      ? Date.parse(rows[1].timestamp_utc) - Date.parse(rows[0].timestamp_utc)
      : 3600000;
  const start = rows.length ? Date.parse(rows[0].timestamp_utc) : 0;
  return {
    start,
    end: start + rows.length * dt,
    dt,
    intervals: rows.map((r) => ({
      x: Date.parse(r.timestamp_utc) + dt / 2,
      charge: Math.min(0, r.power_mw),
      discharge: Math.max(0, r.power_mw),
    })),
    soc: [
      { x: start, soc: battery.initial_soc_mwh },
      ...rows.map((r) => ({
        x: Date.parse(r.timestamp_utc) + dt,
        soc: r.soc_mwh,
      })),
    ],
  };
}
