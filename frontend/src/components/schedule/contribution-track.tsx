import type { Dispatch } from "@/types/api";
import { Bar, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Render one track; time and selection are supplied by the parent. */
export function ContributionTrack({
  trackEvents,
  xAxis,
  tip,
  cursor,
  rows,
  dt,
}: {
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  rows: Dispatch[];
  dt: number;
}) {
  return (
    <div className="plot-card">
      <div className="plot-heading">
        <span className="schedule-track-legend">
          Net contribution{" "}
          <span>
            <i style={{ background: "#237451" }} />
            Positive
          </span>
          <span>
            <i style={{ background: "#b45443" }} />
            Negative
          </span>
        </span>
        <strong>€/interval</strong>
      </div>
      <div
        className="ws-schedule-plot"
        role="img"
        aria-label="Interval net contribution sharing the battery timeline"
        {...trackEvents}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows.map((r) => ({
              x: Date.parse(r.timestamp_utc) + dt / 2,
              gain: Math.max(0, r.interval_pnl_eur),
              cost: Math.min(0, r.interval_pnl_eur),
            }))}
            margin={margin}
          >
            {grid}
            {xAxis}
            <YAxis width={Y_AXIS_WIDTH} tick={axis} />
            {tip}
            {cursor}
            <ReferenceLine y={0} stroke="#829693" />
            <Bar
              dataKey="gain"
              name="Positive contribution"
              fill="#237451"
              maxBarSize={18}
              isAnimationActive={false}
            />
            <Bar
              dataKey="cost"
              name="Negative contribution"
              fill="#b45443"
              maxBarSize={18}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
