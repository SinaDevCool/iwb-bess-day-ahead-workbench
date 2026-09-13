"use client";
import type { Dispatch, OrderSimulation, Simulation } from "@/types/api";
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

const money = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
const moneyExact = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const number = (value: number, digits = 1) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
const time = (value: string) =>
  new Intl.DateTimeFormat("en-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  }).format(new Date(value));
const axisMoney = (value: number) => {
  const absolute = Math.abs(value);
  const compact = absolute >= 1000 ? `${number(absolute / 1000, 1)}k` : number(absolute, 0);
  return `${value < 0 ? "−" : ""}€${compact}`;
};

export function EconomicsPanel({
  result,
  breakdownOnly = false,
}: {
  result: Simulation | OrderSimulation;
  breakdownOnly?: boolean;
}) {
  const manual = "run_type" in result;
  const data = result.dispatch.map((row) => ({
    ...row,
    time: time(row.timestamp_utc),
    contribution: row.interval_pnl_eur,
  }));
  const sales = manual
    ? result.summary.sales_revenue_eur
    : result.summary.proposal_sales_revenue_eur;
  const purchases = manual
    ? result.summary.purchase_cost_eur
    : result.summary.proposal_purchase_cost_eur;
  const degradation = manual
    ? result.summary.degradation_cost_eur
    : result.summary.proposal_degradation_cost_eur;
  const fees = manual
    ? result.summary.transaction_fee_eur
    : result.summary.proposal_transaction_fee_eur;
  const net = manual
    ? result.summary.net_contribution_eur
    : result.summary.expected_contribution_eur;
  return (
    <section className="economics-section" aria-labelledby="economics-title">
      <div className="subsection-heading">
        <div>
          <span className="chart-kicker">FINANCIAL RESULT</span>
          <h3 id="economics-title">Where the Contribution Comes From</h3>
          <p>Interval values reconcile to this saved schedule.</p>
        </div>
      </div>
      <div className={breakdownOnly ? "economics-summary-only" : "economics-grid"}>
        {!breakdownOnly && (
          <figure className="plot-card economics-chart">
            <figcaption>
              <div className="chart-caption-main">
                <strong>Net Contribution by Delivery Interval</strong>
                <span>Forecast value after energy cost, degradation & fees</span>
              </div>
              <div className="chart-legend" aria-hidden="true">
                <span>
                  <i className="legend-block discharge" />
                  Positive
                </span>
                <span>
                  <i className="legend-block charge" />
                  Negative
                </span>
                <b>€/interval</b>
              </div>
            </figcaption>
            <div
              className="plot-area economics-area"
              role="img"
              aria-label="Net contribution in euros for every Day-Ahead delivery interval"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: 4 }}>
                  <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="time"
                    interval={Math.max(Math.floor(data.length / 7), 0)}
                    tick={{ fontSize: 10, fill: "#607477" }}
                    axisLine={{ stroke: "#b7c7c4" }}
                    tickLine={false}
                    tickMargin={9}
                  />
                  <YAxis
                    width={64}
                    tick={{ fontSize: 10, fill: "#607477" }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={7}
                    tickFormatter={axisMoney}
                  />
                  <ReferenceLine y={0} stroke="#748986" strokeWidth={1.2} />
                  <Tooltip
                    content={<EconomicsTip />}
                    cursor={{ fill: "rgba(8, 125, 120, .045)" }}
                  />
                  <Bar
                    dataKey="contribution"
                    name="Net contribution"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={20}
                  >
                    {data.map((row) => (
                      <Cell
                        key={row.interval}
                        fill={row.contribution >= 0 ? "#e67d11" : "#1d9c98"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )}
        <aside className="economics-bridge" aria-label="Daily economics breakdown">
          <div>
            <span>Discharge Revenue</span>
            <strong className={sales >= 0 ? "positive" : "negative"}>{moneyExact(sales)}</strong>
          </div>
          <div>
            <span>Charging Purchases</span>
            <strong>{moneyExact(-purchases)}</strong>
          </div>
          <div>
            <span>Battery Degradation</span>
            <strong>− {moneyExact(degradation)}</strong>
          </div>
          <div>
            <span>Transaction Fees</span>
            <strong>− {moneyExact(fees)}</strong>
          </div>
          <div className="bridge-total">
            <span>Net Contribution</span>
            <strong>{moneyExact(net)}</strong>
          </div>
          <small>
            Forecast-based value after configured exchange and clearing fees; before imbalance costs
            and taxes.
          </small>
        </aside>
      </div>
    </section>
  );
}

function EconomicsTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Dispatch & { time: string } }>;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tip">
      <span className="tip-time">{row.time} · Europe/Zurich</span>
      <strong>{money(row.interval_pnl_eur)} interval contribution</strong>
      <dl>
        <div>
          <dt>Revenue</dt>
          <dd>{money(row.sales_revenue_eur)}</dd>
        </div>
        <div>
          <dt>Purchases</dt>
          <dd>{money(row.purchase_cost_eur)}</dd>
        </div>
        <div>
          <dt>Degradation</dt>
          <dd>{money(row.degradation_cost_eur)}</dd>
        </div>
        <div>
          <dt>Transaction fees</dt>
          <dd>{money(row.transaction_fee_eur)}</dd>
        </div>
      </dl>
    </div>
  );
}
