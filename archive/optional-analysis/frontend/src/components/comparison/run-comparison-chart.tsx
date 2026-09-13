"use client";
import { useDisplayTimezone } from "../workspace/time-preference";
import {
  comparisonKey,
  configurationSignature,
  formatForecastLabel,
  runDisplayName,
} from "@/lib/comparison";
import type { ComparisonMetric, Simulation } from "@/types/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisMoney,
  COLORS,
  formatRunTime,
  metricValue,
  money,
  number,
  outcomeLegend,
  outcomeValue,
  shortId,
  words,
} from "./comparison-format";
export function RunComparisonChart({
  runs,
  metric,
  referenceId,
  focusedId,
  onFocus,
}: {
  runs: Simulation[];
  metric: ComparisonMetric;
  referenceId: string;
  focusedId?: string;
  onFocus: (id: string) => void;
}) {
  const zone = useDisplayTimezone();
  const reference = runs.find((run) => run.simulation_id === referenceId) ?? runs[0];
  const data = runs.map((run) => ({
    runId: run.simulation_id,
    name: `${comparisonKey(runs.indexOf(run))} · ${runDisplayName(run)}`,
    forecast: formatForecastLabel(run.scenario_name),
    metadata: `${run.market.product_minutes} min · ${formatRunTime(run.created_at_utc, zone)} · ${shortId(run.simulation_id)}`,
    signature: configurationSignature(reference, run),
    lowerPrice:
      metric === "contribution" ? outcomeValue(run, "Downside") : metricValue(run, metric),
    centralPrice:
      metric === "contribution" ? outcomeValue(run, "Expected") : metricValue(run, metric),
    higherPrice: metric === "contribution" ? outcomeValue(run, "Upside") : metricValue(run, metric),
  }));
  const unit =
    metric === "contribution"
      ? "EUR"
      : metric === "throughput"
        ? "MWh"
        : metric === "cycles"
          ? "EFC"
          : "orders";
  const formatter = (value: number) =>
    metric === "contribution"
      ? money(value)
      : `${number(value, metric === "cycles" ? 2 : 1)} ${unit}`;
  const height = Math.max(220, runs.length * (metric === "contribution" ? 76 : 56));
  return (
    <figure className="plot-card run-comparison-chart">
      <figcaption>
        <div className="chart-caption-main">
          <strong>
            {metric === "contribution"
              ? "Net Contribution Under 3 DA Price Outcomes"
              : `${words(metric)} by Simulation Run`}
          </strong>
          <span>
            {metric === "contribution"
              ? "Each group is 1 saved order portfolio; values are net of purchases, degradation and transaction fees."
              : "Click a row to inspect the configuration used by that run."}
          </span>
        </div>
        <div className="chart-legend">
          <b>{unit}</b>
        </div>
      </figcaption>
      {metric === "contribution" && (
        <div className="market-outcome-legend" aria-label="Price outcome legend">
          <span>
            <i className="lower" />
            Lower-price outcome
          </span>
          <span>
            <i className="central" />
            Central-price outcome
          </span>
          <span>
            <i className="higher" />
            Higher-price outcome
          </span>
        </div>
      )}
      <div
        className="plot-area"
        style={{ height }}
        role="img"
        aria-label={`${metric === "contribution" ? "Net contribution under lower, central and higher Day-Ahead price outcomes" : words(metric)} for ${runs.length} selected saved runs`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 32, bottom: 4, left: 18 }}
            barCategoryGap="24%"
          >
            <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value) =>
                metric === "contribution"
                  ? axisMoney(value)
                  : number(value, metric === "cycles" ? 2 : 0)
              }
              tick={{ fontSize: 10, fill: "#607477" }}
              axisLine={{ stroke: "#b7c7c4" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={148}
              tick={{ fontSize: 10, fill: "#284b4d", fontWeight: 650 }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine x={0} stroke="#748986" />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="comparison-tooltip">
                    <strong>{payload[0].payload.name}</strong>
                    <span>
                      {payload[0].payload.forecast} · {payload[0].payload.metadata}
                    </span>
                    <em>{payload[0].payload.signature}</em>
                    {payload.map((item) => (
                      <div key={String(item.dataKey)}>
                        <i style={{ background: String(item.color) }} />
                        <span>{outcomeLegend(String(item.dataKey))}</span>
                        <b>{formatter(Number(item.value))}</b>
                      </div>
                    ))}
                  </div>
                ) : null
              }
              cursor={{ fill: "rgba(8, 125, 120, .045)" }}
            />
            {metric === "contribution" ? (
              <>
                <Bar
                  dataKey="lowerPrice"
                  fill={COLORS.downside}
                  radius={[0, 3, 3, 0]}
                  maxBarSize={16}
                  onClick={(_, index) => onFocus(data[index].runId)}
                >
                  {data.map((row) => (
                    <Cell
                      key={`down-${row.runId}`}
                      opacity={focusedId && row.runId !== focusedId ? 0.55 : 1}
                      cursor="pointer"
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="centralPrice"
                  fill={COLORS.expected}
                  radius={[0, 3, 3, 0]}
                  maxBarSize={16}
                  onClick={(_, index) => onFocus(data[index].runId)}
                >
                  {data.map((row) => (
                    <Cell
                      key={`expected-${row.runId}`}
                      opacity={focusedId && row.runId !== focusedId ? 0.55 : 1}
                      cursor="pointer"
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="higherPrice"
                  fill={COLORS.upside}
                  radius={[0, 3, 3, 0]}
                  maxBarSize={16}
                  onClick={(_, index) => onFocus(data[index].runId)}
                >
                  {data.map((row) => (
                    <Cell
                      key={`up-${row.runId}`}
                      opacity={focusedId && row.runId !== focusedId ? 0.55 : 1}
                      cursor="pointer"
                    />
                  ))}
                </Bar>
              </>
            ) : (
              <Bar
                dataKey="centralPrice"
                fill={COLORS.expected}
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
                onClick={(_, index) => onFocus(data[index].runId)}
              >
                {data.map((row) => (
                  <Cell
                    key={row.runId}
                    opacity={focusedId && row.runId !== focusedId ? 0.55 : 1}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
