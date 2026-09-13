import { TrackReadout, type TrackTooltip } from "./track-readout";
import type { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery } from "@/types/api";
import { Bar, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Render one track; time and selection are supplied by the parent. */
export function PowerTrack({
  trackEvents,
  readout,
  xAxis,
  tip,
  cursor,
  intervals,
  battery,
  barSize,
}: {
  readout?: TrackTooltip;
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  intervals: ReturnType<typeof scheduleChartData>["intervals"];
  battery: Battery;
  barSize?: number;
}) {
  return (
    <div className="plot-card schedule-power">
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
        <TrackReadout value={readout} />
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={intervals} margin={margin}>
            {grid}
            {xAxis}
            <YAxis
              width={Y_AXIS_WIDTH}
              tick={axis}
              domain={[
                -Math.max(1, battery.max_charge_power_mw, battery.max_discharge_power_mw),
                Math.max(1, battery.max_charge_power_mw, battery.max_discharge_power_mw),
              ]}
            />
            {tip}
            {cursor}
            <ReferenceLine y={0} stroke="#829693" />
            <ReferenceLine
              y={
                -Math.min(
                  battery.max_charge_power_mw,
                  battery.grid_limit_mw ?? battery.max_charge_power_mw,
                )
              }
              stroke="#7d9295"
              label={{
                value: "Charge limit",
                position: "insideBottomLeft",
                fill: "#526b70",
                fontSize: 11,
              }}
              strokeDasharray="3 4"
            />
            <ReferenceLine
              y={Math.min(
                battery.max_discharge_power_mw,
                battery.grid_limit_mw ?? battery.max_discharge_power_mw,
              )}
              stroke="#7d9295"
              label={{
                value: "Discharge limit",
                position: "insideTopLeft",
                fill: "#526b70",
                fontSize: 11,
              }}
              strokeDasharray="3 4"
            />
            {/* One signed series keeps buy and sell centred on the same interval. */}
            <Bar
              dataKey="power"
              name="Scheduled power MW"
              barSize={barSize}
              isAnimationActive={false}
            >
              {intervals.map((row) => (
                <Cell key={row.x} fill={row.power < 0 ? "#168780" : "#c8750c"} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
