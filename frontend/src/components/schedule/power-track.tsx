import { TrackReadout, type TrackTooltip } from "./track-readout";
import type { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery } from "@/types/api";
import { Bar, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH, chartColors, signedColor } from "./chart-config";
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
            <i aria-hidden="true" style={{ background: chartColors.negative }} />
            Charge −
          </span>
          <span>
            <i aria-hidden="true" style={{ background: chartColors.positive }} />
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
            <ReferenceLine y={0} stroke={chartColors.zero} strokeWidth={1.5} />
            <ReferenceLine
              y={
                -Math.min(
                  battery.max_charge_power_mw,
                  battery.grid_limit_mw ?? battery.max_charge_power_mw,
                )
              }
              stroke={chartColors.limit}
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
              stroke={chartColors.limit}
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
                <Cell key={row.x} fill={signedColor(row.power)} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
