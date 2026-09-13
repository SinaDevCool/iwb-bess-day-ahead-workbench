"use client";
import { Area, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, clock, exact, grid, timeTicks } from "./chart-config";
type Point = { timestamp_utc: string; price_eur_mwh: number | null };
/** Standalone preview; the final point extends the last interval to its boundary. */
export function ForecastPlot({
  points,
  zone = "Europe/Zurich",
}: {
  points: Point[];
  zone?: string;
}) {
  const data = points.map((p) => ({
    x: Date.parse(p.timestamp_utc),
    price: p.price_eur_mwh,
  }));
  const dt = data.length > 1 ? data[1].x - data[0].x : 3600000;
  if (data.length) data.push({ ...data[data.length - 1], x: data[data.length - 1].x + dt });
  const end = data.at(-1)?.x ?? 0;
  return (
    <div
      className="ws-forecast-plot"
      role="img"
      aria-label="Entered Day-Ahead forecast in euros per megawatt-hour"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
          {grid}
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={timeTicks(data[0]?.x ?? 0, end)}
            tickFormatter={(v) => (v === end ? "24:00" : clock(v, zone))}
            tick={axis}
          />
          <YAxis width={55} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(v) => exact(Number(v), zone)} />
          <Area
            dataKey="price"
            name="Forecast €/MWh"
            type="stepAfter"
            stroke="#174b56"
            fill="#eaf3f2"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
