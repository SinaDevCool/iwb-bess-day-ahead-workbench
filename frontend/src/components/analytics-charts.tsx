"use client";
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
import type { Dispatch, Order, Simulation } from "@/types/api";

const money = (value: number) => new Intl.NumberFormat("en-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const moneyExact = (value: number) => new Intl.NumberFormat("en-CH", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const number = (value: number, digits = 1) => new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
const time = (value: string) => new Intl.DateTimeFormat("en-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(value));

export function EconomicsPanel({ result }: { result: Simulation }) {
  const ordersByStart = new Map(result.orders.map((order) => [order.delivery_start_utc, order]));
  const data = result.dispatch.map((row) => ({
    ...row,
    time: time(row.timestamp_utc),
    contribution: ordersByStart.get(row.timestamp_utc)?.expected_contribution_eur ?? 0,
    order: ordersByStart.get(row.timestamp_utc),
  }));
  const sales = result.summary.proposal_sales_revenue_eur ?? 0;
  const purchases = Math.abs(result.summary.proposal_purchase_cost_eur ?? 0);
  const degradation = result.summary.proposal_degradation_cost_eur ?? 0;
  const net = result.summary.expected_contribution_eur ?? 0;
  return <section className="economics-section" aria-labelledby="economics-title">
    <div className="subsection-heading"><div><span className="chart-kicker">FINANCIAL RESULT</span><h3 id="economics-title">Where the Expected Contribution Comes From</h3><p>Interval values and the daily revenue bridge reconcile to the rounded auction-order proposal.</p></div></div>
    <div className="economics-grid">
      <figure className="plot-card economics-chart">
        <figcaption><strong>Net Contribution by Delivery Interval</strong><span>€ per interval · positive bars create value</span></figcaption>
        <div className="plot-area economics-area" role="img" aria-label="Net contribution in euros for every Day-Ahead delivery interval">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: 4 }}>
            <CartesianGrid stroke="#dce5e3" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" interval={Math.max(Math.floor(data.length / 7), 0)} tick={{ fontSize: 10, fill: "#607477" }} tickLine={false} />
            <YAxis width={62} tick={{ fontSize: 10, fill: "#607477" }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v}`} />
            <ReferenceLine y={0} stroke="#81928f" />
            <Tooltip content={<EconomicsTip />} />
            <Bar dataKey="contribution" name="Net contribution" radius={[3, 3, 0, 0]} maxBarSize={20}>{data.map((row) => <Cell key={row.interval} fill={row.contribution >= 0 ? "#e67d11" : "#1d9c98"} />)}</Bar>
          </BarChart></ResponsiveContainer>
        </div>
      </figure>
      <aside className="economics-bridge" aria-label="Daily economics breakdown">
        <div><span>Discharge Revenue</span><strong className="positive">+ {moneyExact(sales)}</strong></div>
        <div><span>Charging Purchases</span><strong>− {moneyExact(purchases)}</strong></div>
        <div><span>Battery Degradation</span><strong>− {moneyExact(degradation)}</strong></div>
        <div className="bridge-total"><span>Expected Net Contribution</span><strong>{moneyExact(net)}</strong></div>
        <small>Forecast-based value before fees, imbalance costs and taxes.</small>
      </aside>
    </div>
  </section>;
}

function EconomicsTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Dispatch & { time: string; order?: Order } }> }) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  const order = row.order;
  return <div className="chart-tip"><span className="tip-time">{row.time} · Europe/Zurich</span><strong>{money(order?.expected_contribution_eur ?? 0)} order contribution</strong><dl><div><dt>Revenue</dt><dd>{money(order?.sales_revenue_eur ?? 0)}</dd></div><div><dt>Purchases</dt><dd>{money(order?.purchase_cost_eur ?? 0)}</dd></div><div><dt>Degradation</dt><dd>{money(order?.degradation_cost_eur ?? 0)}</dd></div></dl></div>;
}

export function OrderTimeline({ orders }: { orders: Order[] }) {
  if (!orders.length) return null;
  const data = orders.map((order) => ({ ...order, time: time(order.delivery_start_utc), signedVolume: order.side === "BUY" ? -order.volume_mw : order.volume_mw }));
  return <figure className="plot-card order-timeline">
    <figcaption><strong>Day-Ahead Order Timeline</strong><span>BUY below zero · SELL above zero · select a table row to edit</span></figcaption>
    <div className="plot-area order-area" role="img" aria-label="Generated Day-Ahead buy and sell orders by delivery interval">
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: 4 }}>
        <CartesianGrid stroke="#dce5e3" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" interval={Math.max(Math.floor(data.length / 8), 0)} tick={{ fontSize: 10, fill: "#607477" }} tickLine={false} />
        <YAxis width={58} tick={{ fontSize: 10, fill: "#607477" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} MW`} />
        <ReferenceLine y={0} stroke="#81928f" />
        <Tooltip content={<OrderTip />} />
        <Bar dataKey="signedVolume" name="Order volume" radius={[3, 3, 0, 0]} maxBarSize={28}>{data.map((order) => <Cell key={order.order_id} fill={order.side === "BUY" ? "#1d9c98" : "#e67d11"} />)}</Bar>
      </BarChart></ResponsiveContainer>
    </div>
  </figure>;
}

function OrderTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Order & { time: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const order = payload[0].payload;
  return <div className="chart-tip"><span className="tip-time">{order.time} · Europe/Zurich</span><strong>{order.side} {number(order.volume_mw)} MW</strong><dl><div><dt>Limit price</dt><dd>{money(order.limit_price_eur_mwh)}/MWh</dd></div><div><dt>Expected price</dt><dd>{money(order.expected_price_eur_mwh)}/MWh</dd></div><div><dt>Contribution</dt><dd>{money(order.expected_contribution_eur)}</dd></div></dl></div>;
}

export function ScenarioOutcomeChart({ baseline, current }: { baseline: Simulation; current: Simulation }) {
  const data = [baseline, ...(baseline.simulation_id === current.simulation_id ? [] : [current])].map((run) => ({ scenario: run.scenario_name, contribution: run.summary.expected_contribution_eur ?? 0, orders: run.summary.order_count ?? 0, cycles: run.summary.equivalent_cycles ?? 0, validation: run.validation.status }));
  return <figure className="plot-card scenario-chart"><figcaption><strong>Expected Contribution by Optimizer Run</strong><span>Only real, completed simulations are compared</span></figcaption><div className="plot-area scenario-area" role="img" aria-label="Expected net contribution comparison for completed scenario runs"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 20 }}><CartesianGrid stroke="#dce5e3" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(v) => `€${v}`} tick={{ fontSize: 10, fill: "#607477" }} /><YAxis type="category" dataKey="scenario" width={120} tick={{ fontSize: 11, fill: "#284b4d" }} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="contribution" name="Expected net contribution" fill="#16867f" radius={[0, 4, 4, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer></div></figure>;
}
