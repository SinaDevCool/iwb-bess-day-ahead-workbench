import type { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery } from "@/types/api";
import {
  Area,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from "recharts";
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
  selectedIndex,
}: {
  trackEvents: ReturnType<typeof useScheduleInspection>["trackEvents"];
  xAxis: React.ReactNode;
  tip: React.ReactNode;
  cursor: React.ReactNode;
  soc: ReturnType<typeof scheduleChartData>["soc"];
  battery: Battery;
  selectedIndex?: number;
}) {
  return (
    <div className="plot-card schedule-soc">
      <div className="plot-heading">
        <span>Stored energy · state of charge</span>
        <strong>MWh</strong>
      </div>
      <p className="schedule-energy-summary">
        Start {battery.initial_soc_mwh} → End {soc[soc.length - 1]?.soc.toFixed(1)} MWh · End
        reserve {battery.target_soc_mwh} MWh
      </p>
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
            {Number.isFinite(battery.target_soc_mwh) && soc.length > 1 && (
              <ReferenceDot
                x={soc[soc.length - 1].x}
                y={battery.target_soc_mwh}
                r={4}
                fill="white"
                stroke="#655fb4"
                strokeWidth={2}
              />
            )}
            {selectedIndex != null &&
              selectedIndex >= 0 &&
              [soc[selectedIndex], soc[selectedIndex + 1]]
                .filter(Boolean)
                .map((point) => (
                  <ReferenceDot
                    key={point.x}
                    x={point.x}
                    y={point.soc}
                    r={3}
                    fill="#655fb4"
                    stroke="white"
                  />
                ))}
            <Area
              dataKey="soc"
              name="Stored energy MWh"
              type="linear"
              stroke="#655fb4"
              strokeWidth={2}
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
