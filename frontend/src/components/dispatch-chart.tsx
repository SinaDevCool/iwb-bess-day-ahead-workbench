"use client";
import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Battery, Dispatch, SimulatedOrderResult } from "@/types/api";
type Point = { timestamp_utc: string; price_eur_mwh: number | null };
const clock = (v: number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
const exact = (v: number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(v));
const axis = { fontSize: 11, fill: "#607477" };
const timeTicks = (start: number, end: number) => [
  ...Array.from(
    { length: Math.ceil((end - start) / 14400000) },
    (_, i) => start + i * 14400000,
  ),
  end,
];
const grid = (
  <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" vertical={false} />
);
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
  if (data.length)
    data.push({ ...data[data.length - 1], x: data[data.length - 1].x + dt });
  const end = data.at(-1)?.x ?? 0;
  return (
    <div
      className="ws-forecast-plot"
      role="img"
      aria-label="Entered Day-Ahead forecast in euros per megawatt-hour"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 18, bottom: 0, left: 0 }}
        >
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
export function scheduleChartData(rows: Dispatch[], battery: Battery) {
  const dt =
    rows.length > 1
      ? Date.parse(rows[1].timestamp_utc) - Date.parse(rows[0].timestamp_utc)
      : 3600000;
  const start = rows.length ? Date.parse(rows[0].timestamp_utc) : 0;
  return {
    start,
    end: start + rows.length * dt,
    dt,
    intervals: rows.map((r) => ({
      x: Date.parse(r.timestamp_utc) + dt / 2,
      charge: Math.min(0, r.power_mw),
      discharge: Math.max(0, r.power_mw),
    })),
    soc: [
      { x: start, soc: battery.initial_soc_mwh },
      ...rows.map((r) => ({
        x: Date.parse(r.timestamp_utc) + dt,
        soc: r.soc_mwh,
      })),
    ],
  };
}
export function DispatchChart({
  rows,
  battery,
  forecast,
  mode = "optimization",
  executedOrderCount,
  submittedOrderCount,
  orderResults,
  selectedOrderId,
  onSelectOrder,
}: {
  rows: Dispatch[];
  battery: Battery;
  forecast?: {
    source_type: "illustrative" | "manual" | "file";
    source_name: string;
    version: string;
  };
  mode?: "optimization" | "order-simulation";
  executedOrderCount?: number;
  submittedOrderCount?: number;
  orderResults?: SimulatedOrderResult[];
  selectedOrderId?: string;
  onSelectOrder?: (id: string) => void;
}) {
  const sync = useId();
  const { start, end, intervals, soc } = scheduleChartData(rows, battery);
  const zone = "Europe/Zurich";
  const prices = rows.map((r) => ({
    x: Date.parse(r.timestamp_utc),
    price: r.price_eur_mwh,
  }));
  if (prices.length) prices.push({ ...prices[prices.length - 1], x: end });
  const xAxis = (
    <XAxis
      dataKey="x"
      type="number"
      domain={[start, end]}
      ticks={timeTicks(start, end)}
      tickFormatter={(v) => (v === end ? "24:00" : clock(v, zone))}
      tick={axis}
      axisLine={false}
      tickLine={false}
    />
  );
  const tip = <Tooltip labelFormatter={(v) => exact(Number(v), zone)} />;
  const margin = { top: 12, right: 24, bottom: 0, left: 0 };
  const selected = orderResults?.find(
    (o) => o.submitted_order.client_order_id === selectedOrderId,
  );
  const selectedX = selected
    ? Date.parse(selected.submitted_order.delivery_start_utc)
    : undefined;
  return (
    <figure className="dispatch-figure ws-schedule">
      <div className="chart-overview">
        <div>
          <h3>
            {mode === "order-simulation"
              ? "Schedule from entered orders"
              : "Day-Ahead battery dispatch"}
          </h3>
          <p>
            {mode === "order-simulation"
              ? (executedOrderCount ?? 0) +
                " of " +
                (submittedOrderCount ?? 0) +
                " orders executed under the entered forecast."
              : "Forecast, scheduled power and stored energy share the delivery timeline."}
          </p>
        </div>
      </div>
      <div className="plot-card">
        <div className="plot-heading">
          <span>{forecast?.source_name ?? "Day-Ahead forecast"}</span>
          <strong>€/MWh</strong>
        </div>
        <div
          className="ws-schedule-plot"
          role="img"
          aria-label="Day-Ahead price forecast"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={prices}
              syncId={sync}
              syncMethod="value"
              margin={margin}
            >
              {grid}
              {xAxis}
              <YAxis width={60} tick={axis} />
              {tip}
              <Area
                dataKey="price"
                name="Forecast €/MWh"
                type="stepAfter"
                stroke="#174b56"
                fill="#edf4f3"
                dot={false}
                isAnimationActive={false}
              />
              {selectedX !== undefined && (
                <ReferenceLine x={selectedX} stroke="#087d78" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="plot-card">
        <div className="plot-heading">
          <span>Scheduled power · Charge − / Discharge +</span>
          <strong>MW</strong>
        </div>
        <div
          className="ws-schedule-plot"
          role="img"
          aria-label="Charging negative and discharging positive power in MW"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={intervals}
              syncId={sync}
              syncMethod="value"
              margin={margin}
            >
              {grid}
              {xAxis}
              <YAxis width={60} tick={axis} />
              {tip}
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
      <div className="plot-card">
        <div className="plot-heading">
          <span>Stored energy · initial state and interval ends</span>
          <strong>MWh</strong>
        </div>
        <div
          className="ws-schedule-plot"
          role="img"
          aria-label="State of charge in MWh with configured minimum and maximum"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={soc}
              syncId={sync}
              syncMethod="value"
              margin={margin}
            >
              {grid}
              {xAxis}
              <YAxis
                width={60}
                domain={[0, battery.capacity_mwh]}
                tick={axis}
              />
              {tip}
              <ReferenceLine
                y={battery.min_soc_mwh}
                stroke="#8980be"
                strokeDasharray="4 4"
              />
              <ReferenceLine
                y={battery.max_soc_mwh}
                stroke="#8980be"
                strokeDasharray="4 4"
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
      {orderResults && orderResults.length > 0 && (
        <details className="ws-chart-orders">
          <summary>Locate an order on the forecast</summary>
          <div>
            {orderResults.map((o) => (
              <button
                type="button"
                key={o.submitted_order.client_order_id}
                aria-pressed={
                  selectedOrderId === o.submitted_order.client_order_id
                }
                onClick={() =>
                  onSelectOrder?.(o.submitted_order.client_order_id)
                }
              >
                {exact(Date.parse(o.submitted_order.delivery_start_utc), zone)}{" "}
                · {o.submitted_order.side} ·{" "}
                {o.execution_status.replaceAll("_", " ").toLowerCase()}
              </button>
            ))}
          </div>
        </details>
      )}
      <figcaption className="chart-foot">
        Europe/Zurich · Power is interval-average; energy joins boundary states
        assuming constant interval power. Dashed lines: {battery.min_soc_mwh}–
        {battery.max_soc_mwh} MWh.
      </figcaption>
    </figure>
  );
}
