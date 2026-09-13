import type { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery } from "@/types/api";
import { Area, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Render one track; time and selection are supplied by the parent. */
export function SocTrack({
  trackEvents,
  xAxis,
  tip,
  cursor,
  soc,
  battery,
}: {
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  soc: ReturnType<typeof scheduleChartData>["soc"];
  battery: Battery;
}) {
  return (
    <div className="plot-card">
      <div className="plot-heading">
        <span>Stored energy · initial state and interval ends</span>
        <strong>MWh</strong>
      </div>
      <div
        className="ws-schedule-plot"
        role="img"
        aria-label="State of charge in MWh with configured minimum and maximum"
        {...trackEvents}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={soc} margin={margin}>
            {grid}
            {xAxis}
            <YAxis width={Y_AXIS_WIDTH} domain={[0, battery.capacity_mwh]} tick={axis} />
            {tip}
            {cursor}
            <ReferenceLine
              y={battery.min_soc_mwh}
              stroke="#8980be"
              strokeDasharray="4 4"
              label={{
                value: `Min ${battery.min_soc_mwh} MWh`,
                position: "insideTopRight",
                fontSize: 12,
              }}
            />
            <ReferenceLine
              y={battery.max_soc_mwh}
              stroke="#8980be"
              strokeDasharray="4 4"
              label={{
                value: `Max ${battery.max_soc_mwh} MWh`,
                position: "insideTopRight",
                fontSize: 12,
              }}
            />
            <Area
              dataKey="soc"
              name="Stored energy MWh"
              type="linear"
              stroke="#655fb4"
              fill="#f0eef8"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
