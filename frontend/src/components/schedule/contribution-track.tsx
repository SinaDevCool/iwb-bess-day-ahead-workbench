import { TrackReadout, type TrackTooltip } from "./track-readout";
import type { Dispatch } from "@/types/api";
import { Bar, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH, chartColors, signedColor } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Render one track; time and selection are supplied by the parent. */
export function ContributionTrack({
  trackEvents,
  readout,
  xAxis,
  tip,
  cursor,
  rows,
  dt,
  barSize,
  label = "Net contribution",
}: {
  readout?: TrackTooltip;
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  rows: Dispatch[];
  dt: number;
  barSize?: number;
  label?: string;
}) {
  return (
    <div className="plot-card schedule-contribution">
      <div className="plot-heading">
        <span className="schedule-track-legend">
          {label}{" "}
          <span>
            <i aria-hidden="true" style={{ background: chartColors.positive }} />
            Positive
          </span>
          <span>
            <i aria-hidden="true" style={{ background: chartColors.negative }} />
            Negative
          </span>
        </span>
        <strong>€/interval</strong>
      </div>
      <div
        className="ws-schedule-plot"
        role="img"
        aria-label={`${label} by interval, sharing the battery timeline`}
        {...trackEvents}
      >
        <TrackReadout value={readout} />
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows.map((r) => ({
              x: Date.parse(r.timestamp_utc) + dt / 2,
              contribution: r.interval_pnl_eur,
            }))}
            margin={margin}
          >
            {grid}
            {xAxis}
            <YAxis
              width={Y_AXIS_WIDTH}
              tick={axis}
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : String(v))}
            />
            {tip}
            {cursor}
            <ReferenceLine y={0} stroke={chartColors.zero} strokeWidth={1.5} />
            <Bar dataKey="contribution" name={label} barSize={barSize} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.timestamp_utc} fill={signedColor(row.interval_pnl_eur)} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
