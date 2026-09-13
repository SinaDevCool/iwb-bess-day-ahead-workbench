"use client";
import {
  Area,
  Line,
  ReferenceArea,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axis, exact, grid, timeTicks, number } from "./chart-config";
import { axisTime, dateText } from "@/lib/time-presentation";
import { useDisplayTimezone } from "../workspace/time-preference";
type Point = { timestamp_utc: string; price_eur_mwh: number | null };
/** Standalone preview; the final point extends the last interval to its boundary. */
export function ForecastPlot({
  points,
  zone: explicitZone,
  baseline,
  baselineLabel = "Original",
  selected,
  onSelect,
}: {
  points: Point[];
  zone?: string;
  baseline?: (number | null)[];
  baselineLabel?: string;
  selected?: string;
  onSelect?: (timestamp: string) => void;
}) {
  const preferredZone = useDisplayTimezone();
  const zone = explicitZone ?? preferredZone;
  const data = points.map((p, i) => ({
    x: Date.parse(p.timestamp_utc),
    price: p.price_eur_mwh,
    original: baseline?.[i] ?? null,
    changed: Boolean(baseline && p.price_eur_mwh !== baseline[i]),
  }));
  const hasChanges = data.some((point) => point.changed);
  const dt = data.length > 1 ? data[1].x - data[0].x : 3600000;
  if (data.length) data.push({ ...data[data.length - 1], x: data[data.length - 1].x + dt });
  const end = data.at(-1)?.x ?? 0;
  return (
    <div className="forecast-chart-block">
      <div className="forecast-chart-legend">
        <span>
          <i className="forecast-edited-key" />
          {baseline && hasChanges ? "Edited" : "Forecast"}
        </span>
        {baseline && hasChanges && (
          <>
            <span>
              <i className="forecast-original-key" />
              {baselineLabel}
            </span>
            <span>
              <i className="forecast-adjusted-key" />
              Adjusted interval
            </span>
          </>
        )}
        <span className="forecast-chart-unit">€/MWh</span>
      </div>
      <div
        className="ws-forecast-plot"
        role="img"
        aria-label="Entered Day-Ahead forecast in euros per megawatt-hour"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 28, bottom: 0, left: 0 }}
            onClick={(event) => {
              const x = Number(event?.activeLabel);
              const point =
                points.find((p) => Date.parse(p.timestamp_utc) === x) ??
                (x === end ? points.at(-1) : undefined);
              if (point) onSelect?.(point.timestamp_utc);
            }}
          >
            {grid}
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={timeTicks(data[0]?.x ?? 0, end)}
              tickFormatter={(v) => axisTime(v, data[0]?.x ?? 0, zone)}
              tick={axis}
              minTickGap={30}
              axisLine={false}
              tickLine={false}
            />
            <YAxis width={55} tick={axis} axisLine={false} tickLine={false} />
            {data
              .slice(0, -1)
              .filter((point) => point.changed)
              .map((point) => (
                <ReferenceArea
                  key={point.x}
                  x1={point.x}
                  x2={point.x + dt}
                  fill="#d99a27"
                  fillOpacity={0.14}
                />
              ))}
            {selected && (
              <ReferenceArea
                x1={Date.parse(selected)}
                x2={Date.parse(selected) + dt}
                stroke="#087d78"
                fill="#087d78"
                fillOpacity={0.06}
              />
            )}
            <Tooltip
              isAnimationActive={false}
              content={({ active, label }) => {
                if (!active) return null;
                const point = data.find((p) => p.x === Number(label));
                if (!point) return null;
                const delta =
                  point.price != null && point.original != null
                    ? point.price - point.original
                    : null;
                return (
                  <div className="forecast-tooltip">
                    <strong>
                      {dateText(point.x, zone)} · {exact(point.x, zone)}
                    </strong>
                    {baseline && (
                      <div>
                        {baselineLabel}
                        <b>{point.original == null ? "—" : number(point.original)}</b>
                      </div>
                    )}
                    <div>
                      {baseline ? "Edited" : "Forecast"}
                      <b>{point.price == null ? "Invalid price" : number(point.price)} €/MWh</b>
                    </div>
                    {baseline && (
                      <div>
                        Change
                        <b>
                          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${number(delta)}`} €/MWh
                        </b>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {baseline && hasChanges && (
              <Line
                dataKey="original"
                type="stepAfter"
                stroke="#7d8b91"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            <Area
              dataKey="price"
              name="Forecast €/MWh"
              type="stepAfter"
              stroke="#087d78"
              strokeWidth={2}
              fill="#eaf3f2"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
