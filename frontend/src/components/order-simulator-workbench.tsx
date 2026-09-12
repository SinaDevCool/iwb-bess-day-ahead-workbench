"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, History, LayoutDashboard, LoaderCircle, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { DispatchChart } from "@/components/dispatch-chart";
import { api } from "@/lib/api";
import type { Battery, Market, OrderSimulation, SubmittedOrderType } from "@/types/api";

type DraftOrder = { id: string; interval: number; side: "BUY" | "SELL"; orderType: SubmittedOrderType; volume: string; limit: string };
type ForecastPoint = { timestamp_utc: string; price_eur_mwh: number };

const money = (value: number) => new Intl.NumberFormat("en-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const number = (value: number, digits = 1) => new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
const time = (value: string, zone = "Europe/Zurich") => new Intl.DateTimeFormat("en-CH", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(value));
const nextId = () => `order-${crypto.randomUUID()}`;

function demoOrders(): DraftOrder[] {
  return [
    { id: nextId(), interval: 5, side: "BUY", orderType: "MARKET", volume: "20", limit: "" },
    { id: nextId(), interval: 6, side: "BUY", orderType: "LIMIT", volume: "20", limit: "40" },
    { id: nextId(), interval: 18, side: "SELL", orderType: "MARKET", volume: "15", limit: "" },
    { id: nextId(), interval: 19, side: "SELL", orderType: "LIMIT", volume: "15", limit: "100" },
  ];
}

export function OrderSimulatorWorkbench({ openOptimizer }: { openOptimizer: () => void }) {
  const [battery, setBattery] = useState<Battery>();
  const [market, setMarket] = useState<Market>();
  const [date, setDate] = useState("2026-09-09");
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [prices, setPrices] = useState<string[]>([]);
  const [orders, setOrders] = useState<DraftOrder[]>([]);
  const [result, setResult] = useState<OrderSimulation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [batteryOpen, setBatteryOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

  const loadDemo = async (deliveryDate = date, resetOrders = false) => {
    setBusy(true);
    setError("");
    try {
      const [configuration, forecast] = await Promise.all([
        api<{ battery: Battery; market: Market }>("/api/configuration"),
        api<{ points: ForecastPoint[] }>(`/api/forecast?delivery_date=${deliveryDate}`),
      ]);
      setBattery(configuration.battery);
      setMarket({ ...configuration.market, product_minutes: 60 });
      setPoints(forecast.points);
      setPrices(forecast.points.map((point) => String(point.price_eur_mwh)));
      if (resetOrders || !orders.length) setOrders(demoOrders());
      setResult(undefined);
      setDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the simulator configuration.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void loadDemo(date, true), 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setChanged = () => { setDirty(true); setError(""); };
  const updateOrder = (id: string, patch: Partial<DraftOrder>) => {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, ...patch } : order).sort((a, b) => a.interval - b.interval));
    setChanged();
  };
  const addOrder = () => {
    const used = new Set(orders.map((order) => order.interval));
    const interval = points.findIndex((_, index) => !used.has(index));
    const created: DraftOrder = { id: nextId(), interval: Math.max(0, interval), side: "BUY", orderType: "LIMIT", volume: "10", limit: prices[Math.max(0, interval)] ?? "0" };
    setOrders((current) => [...current, created].sort((a, b) => a.interval - b.interval));
    setChanged();
  };

  const inputIssue = useMemo(() => {
    if (!battery || !market || !points.length) return "Simulator configuration is still loading.";
    if (prices.length !== points.length || prices.some((price) => price.trim() === "" || !Number.isFinite(Number(price)))) return `Enter one valid price for each of the ${points.length} delivery intervals.`;
    for (const order of orders) {
      if (!Number.isFinite(Number(order.volume)) || Number(order.volume) <= 0) return "Every order needs a positive volume.";
      if (order.orderType === "LIMIT" && (!Number.isFinite(Number(order.limit)) || order.limit.trim() === "")) return "Every Limit order needs a valid limit price.";
    }
    const grouped = new Map<number, Set<string>>();
    orders.forEach((order) => grouped.set(order.interval, new Set([...(grouped.get(order.interval) ?? []), order.side])));
    if ([...grouped.values()].some((sides) => sides.size > 1)) return "BUY and SELL orders cannot share the same delivery interval in this simulator.";
    return "";
  }, [battery, market, orders, points, prices]);

  const simulate = async () => {
    if (inputIssue || !battery || !market) {
      setError(inputIssue || "Complete the inputs before simulating.");
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<OrderSimulation>("/api/order-simulations", {
        method: "POST",
        body: JSON.stringify({
          delivery_date: date, battery, market,
          price_values: prices.map(Number),
          forecast: { source_type: "manual", source_name: "Entered Day-Ahead forecast", version: `manual-${date}-60`, bidding_zone: market.bidding_zone },
          orders: orders.map((order) => ({
            client_order_id: order.id,
            delivery_start_utc: points[order.interval].timestamp_utc,
            side: order.side,
            order_type: order.orderType,
            volume_mw: Number(order.volume),
            limit_price_eur_mwh: order.orderType === "LIMIT" ? Number(order.limit) : null,
          })),
        }),
      });
      setResult(next);
      setDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order simulation failed.");
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };
  const applyPaste = () => {
    const values = paste.trim().split(/[\n,;\s]+/).filter(Boolean);
    if (values.length !== points.length || values.some((value) => !Number.isFinite(Number(value)))) {
      setError(`Paste exactly ${points.length} numeric prices.`);
      return;
    }
    setPrices(values); setChanged(); setPaste(""); setForecastOpen(false);
  };

  if (!battery || !market) return <div className="simulator-loading"><LoaderCircle className="spin" aria-hidden="true" /> Loading order simulator…</div>;

  return <>
    <a className="skip-link" href="#order-simulator">Skip to Order Simulator</a>
    <header className="topbar">
      <Link className="brand" href="/present/"><span className="logo" translate="no">IWB</span><span className="brand-copy"><strong>BESS Day-Ahead Workbench</strong><span>Order-driven battery simulation</span></span></Link>
      <div className="header-status"><Link className="header-action" href="/present/"><LayoutDashboard size={15} aria-hidden="true" /> Overview</Link><Link className="header-action" href="/audit/"><History size={15} aria-hidden="true" /> Decision Log</Link></div>
    </header>
    <div className="safety"><ShieldCheck size={16} aria-hidden="true" /><strong>MODELLING ENVIRONMENT</strong><span>Entered forecast is used as simulated clearing price · no live order submission.</span></div>
    <main id="order-simulator" className="order-simulator-page">
      <section className="simulator-hero">
        <div><span className="eyebrow">IWB HOMEWORK · SWISS DAY-AHEAD</span><h1>Simulate Entered Orders</h1><p>Enter a price forecast and Market or Limit orders, then inspect execution, battery schedule and state of charge.</p></div>
        <nav className="mode-switch" aria-label="Workbench mode"><span aria-current="page">Order Simulator</span><button type="button" onClick={openOptimizer}>Advanced Optimizer</button></nav>
      </section>
      <div className="run-context"><strong>{date}</strong><span>Switzerland · 60-minute products</span><span>100 MWh · 50 MW · 2 h</span><button type="button" onClick={() => setBatteryOpen((value) => !value)} aria-expanded={batteryOpen}>Edit assumptions</button></div>

      <section className="simulator-layout">
        <aside className="simulator-inputs" aria-label="Simulation inputs">
          <div className="simulator-card compact-config">
            <div className="simulator-card-heading"><div><span className="step-badge">1</span><h2>Delivery &amp; Battery</h2></div><button type="button" className="icon-button" aria-label="Restore demo inputs" title="Restore demo inputs" onClick={() => void loadDemo(date, true)}><RotateCcw size={16} aria-hidden="true" /></button></div>
            <label htmlFor="sim-date">Delivery date<input id="sim-date" name="delivery-date" type="date" autoComplete="off" value={date} onChange={(event) => { const value = event.target.value; setDate(value); void loadDemo(value, true); }} /></label>
            {batteryOpen && <div className="mini-field-grid">
              <NumberField label="Initial SoC" unit="MWh" value={battery.initial_soc_mwh} change={(value) => { setBattery({ ...battery, initial_soc_mwh: value }); setChanged(); }} />
              <NumberField label="Minimum SoC" unit="MWh" value={battery.min_soc_mwh} change={(value) => { setBattery({ ...battery, min_soc_mwh: value }); setChanged(); }} />
              <NumberField label="Maximum SoC" unit="MWh" value={battery.max_soc_mwh} change={(value) => { setBattery({ ...battery, max_soc_mwh: value }); setChanged(); }} />
              <NumberField label="End reserve" unit="MWh" value={battery.target_soc_mwh} change={(value) => { setBattery({ ...battery, target_soc_mwh: value }); setChanged(); }} />
              <NumberField label="Charge limit" unit="MW" value={battery.max_charge_power_mw} change={(value) => { setBattery({ ...battery, max_charge_power_mw: value }); setChanged(); }} />
              <NumberField label="Discharge limit" unit="MW" value={battery.max_discharge_power_mw} change={(value) => { setBattery({ ...battery, max_discharge_power_mw: value }); setChanged(); }} />
            </div>}
            <p className="assumption-note">100 MWh · 50 MW baseline · 2 h · {number(battery.round_trip_efficiency * 100, 0)}% efficiency · {number(battery.max_equivalent_cycles)} EFC/day</p>
          </div>

          <div className="simulator-card">
            <div className="simulator-card-heading"><div><span className="step-badge">1</span><h2>Day-Ahead Forecast</h2></div><button type="button" className="secondary small" onClick={() => setForecastOpen((value) => !value)} aria-expanded={forecastOpen}>Edit / Paste</button></div>
            <p>Enter the simulated clearing price for each hourly delivery product.</p>
            <div className="forecast-summary"><strong>{prices.filter(Boolean).length}/{points.length} values</strong><span>€{Math.min(...prices.map(Number))}–€{Math.max(...prices.map(Number))}/MWh</span></div>
            {forecastOpen && <><textarea className="forecast-paste" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste 24 prices separated by lines, commas or semicolons…" aria-label="Paste Day-Ahead prices"/><button type="button" className="secondary small" onClick={applyPaste}>Apply Pasted Prices</button><div className="forecast-grid">{points.map((point, index) => <label key={point.timestamp_utc} htmlFor={`forecast-${index}`}><span>{time(point.timestamp_utc, market.timezone)}</span><span className="unit-input"><input id={`forecast-${index}`} name={`forecast-${index}`} type="number" inputMode="decimal" autoComplete="off" step={market.price_increment_eur_mwh} value={prices[index] ?? ""} onChange={(event) => { setPrices((current) => current.map((value, item) => item === index ? event.target.value : value)); setChanged(); }} /><small>€/MWh</small></span></label>)}</div></>}
          </div>
        </aside>

        <div className="simulator-main">
          <section className="simulator-card order-entry-card">
            <div className="simulator-card-heading"><div><span className="step-badge">3</span><h2>Market &amp; Limit Orders</h2></div><button type="button" className="secondary small" onClick={addOrder}><Plus size={15} aria-hidden="true" /> Add Order</button></div>
            <p>Market orders always clear in this model. Limit BUY clears at or below its limit; Limit SELL at or above it.</p>
            {orders.length ? <div className="order-entry-list">{orders.map((order, rowIndex) => <div className="order-entry-row" key={order.id}>
              <span className="row-number" aria-hidden="true">{rowIndex + 1}</span>
              <label>Delivery<select name={`delivery-${order.id}`} value={order.interval} onChange={(event) => updateOrder(order.id, { interval: Number(event.target.value) })}>{points.map((point, index) => <option value={index} key={point.timestamp_utc}>{time(point.timestamp_utc, market.timezone)}</option>)}</select></label>
              <label>Side<select name={`side-${order.id}`} value={order.side} onChange={(event) => updateOrder(order.id, { side: event.target.value as "BUY" | "SELL" })}><option>BUY</option><option>SELL</option></select></label>
              <label>Type<select name={`type-${order.id}`} value={order.orderType} onChange={(event) => updateOrder(order.id, { orderType: event.target.value as SubmittedOrderType, limit: event.target.value === "MARKET" ? "" : (order.limit || prices[order.interval] || "") })}><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select></label>
              <label>Volume<span className="unit-input"><input name={`volume-${order.id}`} type="number" inputMode="decimal" autoComplete="off" min={market.volume_increment_mw} step={market.volume_increment_mw} value={order.volume} onChange={(event) => updateOrder(order.id, { volume: event.target.value })} /><small>MW</small></span></label>
              <label>Limit<span className="unit-input"><input aria-label={`Limit price for order ${rowIndex + 1}`} name={`limit-${order.id}`} type="number" inputMode="decimal" autoComplete="off" step={market.price_increment_eur_mwh} disabled={order.orderType === "MARKET"} value={order.limit} placeholder={order.orderType === "MARKET" ? "Market" : "0"} onChange={(event) => updateOrder(order.id, { limit: event.target.value })} /><small>€/MWh</small></span></label>
              <button type="button" className="icon-button remove-order" aria-label={`Remove order ${rowIndex + 1}`} onClick={() => { setOrders((current) => current.filter((item) => item.id !== order.id)); setChanged(); }}><Trash2 size={16} aria-hidden="true" /></button>
            </div>)}</div> : <div className="state-block"><strong>No orders entered</strong><span>Add a Market or Limit order to simulate battery activity.</span></div>}
          </section>

          {error && <div className="banner error" role="alert" tabIndex={-1} ref={errorRef}><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span></div>}
          <div className="simulation-action"><div><strong>Forecast-clearing assumption</strong><span>Full execution at forecast price; no partial clearing, market impact or clearing probability.</span></div><button type="button" className="primary" disabled={busy} onClick={() => void simulate()}>{busy ? <><LoaderCircle className="spin" size={18} aria-hidden="true" /> Simulating…</> : "Simulate Orders"}</button></div>

          <section aria-live="polite" aria-busy={busy}>{result ? <SimulationResults result={result} /> : <div className="simulator-empty"><span className="step-badge">4</span><h2>Schedule &amp; Execution</h2><p>Run the simulation to see which orders clear, how SoC evolves and whether the schedule is physically feasible.</p></div>}</section>
        </div>
      </section>
    </main>
  </>;
}

function NumberField({ label, unit, value, change }: { label: string; unit: string; value: number; change: (value: number) => void }) {
  const id = `battery-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <label htmlFor={id}>{label}<span className="unit-input"><input id={id} name={id} type="number" inputMode="decimal" autoComplete="off" value={value} onChange={(event) => change(Number(event.target.value))} /><small>{unit}</small></span></label>;
}

function SimulationResults({ result }: { result: OrderSimulation }) {
  const orderedResults = [...result.order_results].sort((a, b) => a.submitted_order.delivery_start_utc.localeCompare(b.submitted_order.delivery_start_utc));
  return <div className="simulation-results">
    <div className={`result-verdict ${result.validation.status}`}><div>{result.validation.status === "passed" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<span><strong>{result.validation.status === "passed" ? "Schedule is physically feasible" : "Schedule needs attention"}</strong><small>{result.summary.executed_order_count} executed · {result.summary.not_executed_order_count} price-rejected · {result.summary.infeasible_order_count} infeasible</small></span></div><strong>{money(result.summary.net_contribution_eur)}</strong></div>
    <div className="simulation-kpis"><Kpi label="Submitted" value={String(result.summary.submitted_order_count)} detail="entered orders" /><Kpi label="Executed" value={String(result.summary.executed_order_count)} detail="cleared & feasible" /><Kpi label="Final SoC" value={`${number(result.summary.final_soc_mwh)} MWh`} detail={`started at ${number(result.summary.initial_soc_mwh)} MWh`} /><Kpi label="Net contribution" value={money(result.summary.net_contribution_eur)} detail="executed orders only" /></div>
    <div className="simulator-card"><DispatchChart rows={result.dispatch} battery={result.battery} forecast={result.forecast} mode="order-simulation" executedOrderCount={result.summary.executed_order_count} submittedOrderCount={result.summary.submitted_order_count} /></div>
    <div className="simulator-card execution-card"><div className="simulator-card-heading"><div><span className="step-badge">5</span><h2>Execution Evidence</h2></div><span className={`validation-pill ${result.validation.status}`}>{result.validation.status}</span></div>
      <div className="table-scroll"><table className="execution-table"><caption className="sr-only">Entered order clearing and battery execution results</caption><thead><tr><th>Delivery</th><th>Entered order</th><th className="numeric">Forecast</th><th className="numeric">Executed</th><th className="numeric">SoC after</th><th className="numeric">Contribution</th><th>Outcome</th></tr></thead><tbody>{orderedResults.map((item) => <tr key={item.submitted_order.client_order_id}><td>{time(item.submitted_order.delivery_start_utc, result.market.timezone)}</td><td><strong>{item.submitted_order.order_type} {item.submitted_order.side}</strong><small>{number(item.submitted_order.volume_mw)} MW{item.submitted_order.limit_price_eur_mwh != null ? ` · ${item.submitted_order.side === "BUY" ? "≤" : "≥"} ${money(item.submitted_order.limit_price_eur_mwh)}/MWh` : ""}</small></td><td className="numeric">{money(item.forecast_price_eur_mwh)}</td><td className="numeric">{number(item.executed_volume_mw)} MW</td><td className="numeric">{number(item.soc_after_mwh)} MWh</td><td className={`numeric ${item.contribution_eur >= 0 ? "positive" : "negative"}`}>{money(item.contribution_eur)}</td><td><span className={`execution-status ${item.execution_status.toLowerCase()}`}>{item.execution_status.replaceAll("_", " ")}</span><small>{item.reason}</small></td></tr>)}</tbody></table></div>
      {result.validation.findings.length > 0 && <div className="validation-findings"><strong>Validation findings</strong>{result.validation.findings.map((finding, index) => <p key={`${finding.code}-${index}`}>{finding.interval != null ? `${time(result.dispatch[finding.interval].timestamp_utc, result.market.timezone)} · ` : ""}{finding.message}</p>)}</div>}
    </div>
  </div>;
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="sim-kpi"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
