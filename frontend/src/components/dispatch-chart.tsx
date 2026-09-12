"use client";
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
import type { Battery, Dispatch } from "@/types/api";

export function DispatchChart({
  rows,
  battery,
  forecast,
  mode = "optimization",
  executedOrderCount,
  submittedOrderCount,
}: {
  rows: Dispatch[];
  battery: Battery;
  forecast?: { source_type: "illustrative" | "manual" | "file"; source_name: string; version: string };
  mode?: "optimization" | "order-simulation";
  executedOrderCount?: number;
  submittedOrderCount?: number;
}) {
  const data = rows.map((row) => ({
    ...row,
    time: row.timestamp_local.slice(11, 16),
    charge: row.power_mw < 0 ? row.power_mw : 0,
    discharge: row.power_mw > 0 ? row.power_mw : 0,
  }));
  const charges = rows.filter((row) => row.action === "charge");
  const discharges = rows.filter((row) => row.action === "discharge");
  const low = Math.min(...rows.map((row) => row.price_eur_mwh));
  const high = Math.max(...rows.map((row) => row.price_eur_mwh));
  const effectivePower = Math.max(
    battery.max_charge_power_mw,
    battery.max_discharge_power_mw,
    battery.grid_limit_mw,
  );
  const powerAxis = Math.max(1, Math.ceil(effectivePower / 10) * 10);
  const powerTicks = [-powerAxis, -powerAxis / 2, 0, powerAxis / 2, powerAxis];
  const socTicks = [
    ...new Set([
      0,
      battery.min_soc_mwh,
      battery.max_soc_mwh,
      battery.capacity_mwh,
    ]),
  ].sort((a, b) => a - b);
  const summary = mode === "order-simulation"
    ? `${executedOrderCount ?? 0} of ${submittedOrderCount ?? 0} submitted orders executed under the entered price forecast.`
    : `The battery charges in ${charges.length} low-price intervals and discharges in ${discharges.length} high-price intervals.`;
  const forecastLabel = forecast?.source_type === "manual" ? forecast.source_name : "Illustrative Day-Ahead Price Forecast";
  return (
    <figure className="dispatch-figure">
      <div className="chart-overview">
        <div>
          <span className="chart-kicker">{mode === "order-simulation" ? "ORDER SIMULATION RESULT" : "OPTIMIZATION RESULT"}</span>
          <h3>{mode === "order-simulation" ? "Schedule From Entered Orders" : "Day-Ahead Battery Dispatch"}</h3>
          <p>{summary}</p>
        </div>
        <div className="chart-facts">
          <span>
            <small>Lowest DA price forecast</small>
            <strong>{euro(low)}/MWh</strong>
          </span>
          <span>
            <small>Highest DA price forecast</small>
            <strong>{euro(high)}/MWh</strong>
          </span>
          <span>
            <small>Forecast spread</small>
            <strong>{euro(high - low)}/MWh</strong>
          </span>
        </div>
      </div>
      <div className="dispatch-plots">
      <div className="plot-card price-plot">
        <div className="plot-heading">
          <span>
            <i className="legend-line price" aria-hidden="true" />
            {forecastLabel}
          </span>
          <strong>€/MWh</strong>
        </div>
        <div
          className="plot-area"
          role="img"
          aria-label={`${forecastLabel} in euros per megawatt-hour. ${summary}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              syncId="dispatch"
              margin={{ top: 8, right: 18, bottom: 0, left: 4 }}
            >
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d5963" stopOpacity=".18" />
                  <stop offset="100%" stopColor="#1d5963" stopOpacity=".02" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis
                width={55}
                tick={{ fontSize: 11, fill: "#607477" }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tickFormatter={(value) => `€${value}`}
              />
              <Tooltip content={<Tip />} cursor={{ stroke: "#9bb2af", strokeDasharray: "3 3" }} />
              <Area
                dataKey="price_eur_mwh"
                name={forecastLabel}
                stroke="#174b56"
                fill="url(#priceFill)"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="plot-card dispatch-plot">
        <div className="plot-heading">
          <span>
            <i className="legend-block charge" aria-hidden="true" />
            Charge <b>−</b>
            <i className="legend-block discharge" aria-hidden="true" />
            Discharge <b>+</b>
            <i className="legend-line soc" aria-hidden="true" />
            State of Charge
          </span>
          <span className="axis-units">
            <strong>MW</strong>
            <strong>MWh</strong>
          </span>
        </div>
        <div
          className="plot-area large"
          role="img"
          aria-label={`Battery dispatch in megawatts and state of charge in megawatt-hours. ${summary}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              syncId="dispatch"
              margin={{ top: 9, right: 10, bottom: 2, left: 4 }}
            >
              <defs>
                <linearGradient id="socFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#655fb4" stopOpacity=".18" />
                  <stop offset="100%" stopColor="#655fb4" stopOpacity=".02" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="time"
                interval={Math.max(Math.floor(rows.length / 8), 0)}
                tick={{ fontSize: 11, fill: "#607477" }}
                axisLine={{ stroke: "#aebfbc" }}
                tickLine={false}
                tickMargin={9}
                height={34}
              />
              <YAxis
                yAxisId="power"
                width={58}
                domain={[-powerAxis, powerAxis]}
                ticks={powerTicks}
                tick={{ fontSize: 11, fill: "#607477" }}
                axisLine={false}
                tickLine={false}
                tickMargin={7}
                tickFormatter={(value) => `${value} MW`}
              />
              <YAxis
                yAxisId="soc"
                orientation="right"
                width={62}
                domain={[0, battery.capacity_mwh]}
                ticks={socTicks}
                tick={{ fontSize: 11, fill: "#655fb4" }}
                axisLine={false}
                tickLine={false}
                tickMargin={7}
                tickFormatter={(value) => `${value} MWh`}
              />
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(8, 125, 120, .045)" }} />
              <ReferenceLine
                yAxisId="power"
                y={0}
                stroke="#81928f"
                strokeWidth={1.2}
              />
              <ReferenceLine
                yAxisId="soc"
                y={battery.min_soc_mwh}
                stroke="#a7a2d5"
                strokeDasharray="5 4"
              />
              <ReferenceLine
                yAxisId="soc"
                y={battery.max_soc_mwh}
                stroke="#a7a2d5"
                strokeDasharray="5 4"
              />
              <Bar
                yAxisId="power"
                dataKey="charge"
                name="Charge MW"
                fill="#1d9c98"
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
              <Bar
                yAxisId="power"
                dataKey="discharge"
                name="Discharge MW"
                fill="#e67d11"
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
              <Area
                yAxisId="soc"
                dataKey="soc_mwh"
                name="SoC MWh"
                stroke="#655fb4"
                fill="url(#socFill)"
                strokeWidth={2.5}
                type="stepAfter"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      </div>
      <div className="chart-foot">
        <span>
          <i className="bound" aria-hidden="true" />
          Dashed lines: configured {number(battery.min_soc_mwh)}–
          {number(battery.max_soc_mwh)} MWh SoC envelope
        </span>
        <span>Delivery time · Europe/Zurich · hover for exact values</span>
      </div>
    </figure>
  );
}

function Tip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: Dispatch }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tip">
      <span className="tip-time">{label} · Europe/Zurich</span>
      <strong>
        {title(row.action)} {Math.abs(row.power_mw).toFixed(1)} MW
      </strong>
      <dl>
        <div>
          <dt>Illustrative DA price forecast</dt>
          <dd>{euro(row.price_eur_mwh)}/MWh</dd>
        </div>
        <div>
          <dt>State of charge</dt>
          <dd>{row.soc_mwh.toFixed(1)} MWh</dd>
        </div>
        <div>
          <dt>Interval contribution</dt>
          <dd>{euro(row.interval_pnl_eur)}</dd>
        </div>
      </dl>
    </div>
  );
}
const euro = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
const number = (value: number) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: 1 }).format(value);
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
