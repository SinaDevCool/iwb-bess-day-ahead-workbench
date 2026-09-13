"use client";
export { scheduleChartData } from "@/lib/schedule-chart-data";
export { ForecastPlot } from "./schedule/forecast-plot";
import { TooltipPosition } from "./schedule/tooltip-position";
import { useChartWidth } from "./schedule/use-chart-width";
import { scheduleChartData } from "@/lib/schedule-chart-data";
import type { Battery, Dispatch, Market, SimulatedOrderResult } from "@/types/api";
import { ReferenceArea, ReferenceLine, XAxis } from "recharts";
import {
  axis,
  clock,
  exact,
  euros,
  number,
  timeTicks,
  Y_AXIS_WIDTH,
  margin,
} from "./schedule/chart-config";
import { ContributionTrack } from "./schedule/contribution-track";
import { ForecastTrack } from "./schedule/forecast-track";
import { PowerTrack } from "./schedule/power-track";
import { SocTrack } from "./schedule/soc-track";
import { useScheduleInspection } from "./schedule/use-schedule-inspection";
import { useDisplayTimezone } from "./workspace/time-preference";
import { axisTime } from "@/lib/time-presentation";
/** Compose tracks on one time axis; no chart computes battery economics. */
export function DispatchChart({
  rows,
  battery,
  market,
  onShowDetails,
  forecast,
  mode = "optimization",
  executedOrderCount,
  submittedOrderCount,
  orderResults,
  selectedOrderId,
  selectedInterval,
  onSelectInterval,
  showContribution = false,
  contributionLabel = "Net contribution",
}: {
  rows: Dispatch[];
  battery: Battery;
  market?: Pick<Market, "product_minutes" | "timezone">;
  onShowDetails?: () => void;
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
  selectedInterval?: string;
  onSelectInterval?: (id: string) => void;
  showContribution?: boolean;
  contributionLabel?: string;
}) {
  const { start, end, dt, intervals, soc } = scheduleChartData(
    rows,
    battery,
    market?.product_minutes,
  );
  const zone = useDisplayTimezone();
  const { ref, width } = useChartWidth();
  const barSize = Math.max(
    1,
    ((width - Y_AXIS_WIDTH - margin.right) / Math.max(1, rows.length)) * 0.8,
  );
  const prices = rows.map((r) => ({
    x: Date.parse(r.timestamp_utc),
    price: r.price_eur_mwh,
  }));
  if (prices.length) prices.push({ ...prices[prices.length - 1], x: end });
  const xAxis = (labels: boolean) => (
    <XAxis
      dataKey="x"
      type="number"
      domain={[start, end]}
      ticks={timeTicks(start, end).filter(
        (_, i, a) => width > 650 || i % 2 === 0 || i === a.length - 1,
      )}
      tickFormatter={(v) => axisTime(v, start, zone)}
      tick={labels ? axis : false}
      height={labels ? 26 : 8}
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
    onShowDetails,
  );
  const { active, trackEvents } = inspection;
  const tip = null;
  const activeTime = active
    ? `${exact(Date.parse(active.timestamp_utc), zone)}–${clock(Date.parse(active.timestamp_utc) + dt, zone)}`
    : "";
  const readouts = active
    ? {
        price: `${activeTime} · Forecast ${euros(active.price_eur_mwh)}/MWh`,
        power: `${activeTime} · ${active.action} ${number(active.power_mw, 1)} MW · Energy ${number((Math.abs(active.power_mw) * dt) / 3600000)} MWh`,
        soc: `${activeTime} · ${number(inspection.activeIndex > 0 ? rows[inspection.activeIndex - 1].soc_mwh : battery.initial_soc_mwh)} → ${number(active.soc_mwh)} MWh`,
        contribution: `${activeTime} · ${euros(active.interval_pnl_eur)}`,
      }
    : undefined;
  const cursor = (
    <>
      {(battery.unavailable_intervals ?? []).map(
        (index) =>
          rows[index] && (
            <ReferenceArea
              key={index}
              x1={Date.parse(rows[index].timestamp_utc)}
              x2={Date.parse(rows[index].timestamp_utc) + dt}
              fill="#738087"
              fillOpacity={0.1}
            />
          ),
      )}
      {active ? (
        <>
          <ReferenceArea
            x1={Date.parse(active.timestamp_utc)}
            x2={Date.parse(active.timestamp_utc) + dt}
            fill="#087d78"
            fillOpacity={0.04}
          />
          <ReferenceLine
            x={Date.parse(active.timestamp_utc) + dt / 2}
            stroke="#174b56"
            strokeDasharray="3 3"
          />
        </>
      ) : null}
    </>
  );
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
      {rows.length === 0 && (
        <p>No delivery intervals to display. Enter a forecast and simulate orders.</p>
      )}
      <TooltipPosition.Provider
        value={
          (Y_AXIS_WIDTH + inspection.fraction * (width - Y_AXIS_WIDTH - margin.right)) /
          Math.max(1, width)
        }
      >
        <div ref={ref} className="schedule-tracks" hidden={rows.length === 0}>
          <ForecastTrack
            readout={readouts?.price}
            trackEvents={trackEvents}
            xAxis={xAxis(false)}
            tip={tip}
            cursor={cursor}
            prices={prices}
            forecast={forecast}
            selectedX={selectedX}
            selectedLimit={
              selected?.submitted_order.order_type === "LIMIT"
                ? selected.submitted_order.limit_price_eur_mwh
                : undefined
            }
            dt={dt}
          />
          <PowerTrack
            readout={readouts?.power}
            trackEvents={trackEvents}
            xAxis={xAxis(false)}
            tip={tip}
            cursor={cursor}
            intervals={intervals}
            barSize={barSize}
            battery={battery}
          />
          <SocTrack
            readout={readouts?.soc}
            trackEvents={trackEvents}
            xAxis={xAxis(!showContribution)}
            tip={tip}
            cursor={cursor}
            soc={soc}
            selectedIndex={inspection.activeIndex}
            battery={battery}
          />
          {showContribution && (
            <ContributionTrack
              readout={readouts?.contribution}
              label={contributionLabel}
              trackEvents={trackEvents}
              xAxis={xAxis(true)}
              tip={tip}
              cursor={cursor}
              rows={rows}
              dt={dt}
              barSize={barSize}
            />
          )}
        </div>
      </TooltipPosition.Provider>
      <figcaption className="chart-foot">
        Hover or focus a chart and use arrow keys to inspect. Click or press Enter for interval
        details. Escape dismisses tooltips. {dt / 60000}-minute intervals · Power is
        interval-average; energy joins boundary states assuming constant interval power. Dashed
        lines: {battery.min_soc_mwh}–{battery.max_soc_mwh} MWh. End reserve:{" "}
        {battery.target_soc_mwh} MWh (end marker only). Vertical dashed line: inspected interval,
        shared by all charts. Shaded intervals: unavailable. Power dashed lines: charge/discharge
        limits.
      </figcaption>
    </figure>
  );
}
