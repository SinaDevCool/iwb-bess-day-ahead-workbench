import { Area, ComposedChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { axis, grid, margin, Y_AXIS_WIDTH } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Render one track; time and selection are supplied by the parent. */
export function ForecastTrack({
  trackEvents,
  xAxis,
  tip,
  cursor,
  prices,
  forecast,
  selectedX,
  selectedLimit,
  dt,
}: {
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  prices: { x: number; price: number }[];
  forecast: { source_name: string } | undefined;
  selectedX: number | undefined;
  selectedLimit?: number | null;
  dt: number;
}) {
  return (
    <div className="plot-card schedule-forecast">
      <div className="plot-heading">
        <span>Day-Ahead price forecast · {forecast?.source_name ?? "Saved forecast"}</span>
        <strong>€/MWh</strong>
      </div>
      <div
        className="ws-schedule-plot"
        role="img"
        aria-label="Day-Ahead price forecast"
        {...trackEvents}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={prices} margin={margin}>
            {grid}
            {xAxis}
            <YAxis width={Y_AXIS_WIDTH} tick={axis} />
            {tip}
            {cursor}
            <Area
              dataKey="price"
              name="Forecast €/MWh"
              type="stepAfter"
              stroke="#174b56"
              strokeWidth={2}
              fill="#edf4f3"
              dot={false}
              isAnimationActive={false}
            />
            {selectedX !== undefined && selectedLimit != null && (
              <ReferenceLine
                segment={[
                  { x: selectedX, y: selectedLimit },
                  { x: selectedX + dt, y: selectedLimit },
                ]}
                stroke="#a55413"
                strokeWidth={3}
                strokeDasharray="4 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
