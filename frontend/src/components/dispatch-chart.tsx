"use client";
export { scheduleChartData } from "@/lib/schedule-chart-data";
export { ForecastPlot } from "./schedule/forecast-plot";
import { intervalAtTime } from "@/lib/interval-evidence";
import { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery, Dispatch, SimulatedOrderResult } from "@/types/api";
import { ReferenceLine, Tooltip, XAxis } from "recharts";
import { axis, clock, exact, timeTicks } from "./schedule/chart-config";
import { ContributionTrack } from "./schedule/contribution-track";
import { ForecastTrack } from "./schedule/forecast-track";
import { PowerTrack } from "./schedule/power-track";
import { ScheduleInspector } from "./schedule/schedule-inspector";
import { SocTrack } from "./schedule/soc-track";
import { useScheduleInspection } from "./schedule/use-schedule-inspection";
/** Compose tracks on one time axis; no chart computes battery economics. */
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
  selectedInterval,
  onSelectInterval,
  showContribution = false,
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
  selectedInterval?: string;
  onSelectInterval?: (id: string) => void;
  showContribution?: boolean;
}) {
  const { start, end, dt, intervals, soc } = scheduleChartData(rows, battery);
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
  const inspection = useScheduleInspection(
    rows,
    start,
    end,
    dt,
    selectedInterval,
    onSelectInterval,
  );
  const { active, inspect, setPinned, trackEvents } = inspection;
  const tip = <Tooltip content={() => null} cursor={false} />;
  const cursor = active ? (
    <ReferenceLine
      x={Date.parse(active.timestamp_utc) + dt / 2}
      stroke="#174b56"
      strokeDasharray="3 3"
    />
  ) : null;
  const selected = orderResults?.find((o) => o.submitted_order.client_order_id === selectedOrderId);
  const selectedX = selected ? Date.parse(selected.submitted_order.delivery_start_utc) : undefined;
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
      <ScheduleInspector
        inspection={inspection}
        rows={rows}
        battery={battery}
        dt={dt}
        zone={zone}
        orderResults={orderResults}
      />
      <ForecastTrack
        trackEvents={trackEvents}
        xAxis={xAxis}
        tip={tip}
        cursor={cursor}
        prices={prices}
        forecast={forecast}
        selectedX={selectedX}
      />
      <PowerTrack
        trackEvents={trackEvents}
        xAxis={xAxis}
        tip={tip}
        cursor={cursor}
        intervals={intervals}
        battery={battery}
      />
      <SocTrack
        trackEvents={trackEvents}
        xAxis={xAxis}
        tip={tip}
        cursor={cursor}
        soc={soc}
        battery={battery}
      />
      {showContribution && (
        <ContributionTrack
          trackEvents={trackEvents}
          xAxis={xAxis}
          tip={tip}
          cursor={cursor}
          rows={rows}
          dt={dt}
        />
      )}
      {orderResults && orderResults.length > 0 && (
        <details className="ws-chart-orders">
          <summary>Locate an order on the forecast</summary>
          <div>
            {orderResults.map((o) => (
              <button
                type="button"
                key={o.submitted_order.client_order_id}
                aria-pressed={selectedOrderId === o.submitted_order.client_order_id}
                onClick={() => {
                  onSelectOrder?.(o.submitted_order.client_order_id);
                  const index = intervalAtTime(
                    rows.map((r) => Date.parse(r.timestamp_utc)),
                    dt,
                    Date.parse(o.submitted_order.delivery_start_utc),
                  );
                  if (index >= 0) {
                    inspect(index);
                    setPinned(true);
                  }
                }}
              >
                {exact(Date.parse(o.submitted_order.delivery_start_utc), zone)} ·{" "}
                {o.submitted_order.side} · {o.execution_status.replaceAll("_", " ").toLowerCase()}
              </button>
            ))}
          </div>
        </details>
      )}
      <figcaption className="chart-foot">
        Europe/Zurich · Power is interval-average; energy joins boundary states assuming constant
        interval power. Dashed lines: {battery.min_soc_mwh}–{battery.max_soc_mwh} MWh.
      </figcaption>
    </figure>
  );
}
