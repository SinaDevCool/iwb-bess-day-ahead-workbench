import type { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery } from "@/types/api";
import { Bar, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Render one track; time and selection are supplied by the parent. */
export function PowerTrack({
  trackEvents,
  xAxis,
  tip,
  cursor,
  intervals,
  battery,
}: {
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  intervals: ReturnType<typeof scheduleChartData>["intervals"];
  battery: Battery;
}) {
  return (
    <div className="plot-card">
      <div className="plot-heading">
        <span className="schedule-track-legend">
          Scheduled power{" "}
          <span>
            <i style={{ background: "#1d9c98" }} />
            Charge −
          </span>
          <span>
            <i style={{ background: "#db7c13" }} />
            Discharge +
          </span>
        </span>
        <strong>MW</strong>
      </div>
      <div
        className="ws-schedule-plot"
        role="img"
        aria-label="Charging negative and discharging positive power in MW"
        {...trackEvents}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={intervals} margin={margin}>
            {grid}
            {xAxis}
            <YAxis
              width={Y_AXIS_WIDTH}
              tick={axis}
              domain={[
                -Math.max(battery.max_charge_power_mw, battery.max_discharge_power_mw),
                Math.max(battery.max_charge_power_mw, battery.max_discharge_power_mw),
              ]}
            />
            {tip}
            {cursor}
            <ReferenceLine y={0} stroke="#829693" />
            <Bar
              dataKey="charge"
              name="Charge MW"
              fill="#1d9c98"
              maxBarSize={18}
              isAnimationActive={false}
            />
            <Bar
              dataKey="discharge"
              name="Discharge MW"
              fill="#db7c13"
              maxBarSize={18}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
