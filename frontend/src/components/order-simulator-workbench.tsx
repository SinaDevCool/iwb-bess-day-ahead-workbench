"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Columns3, History, LayoutDashboard, LoaderCircle, Plus, RotateCcw, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { DispatchChart } from "@/components/dispatch-chart";
import { api } from "@/lib/api";
import { parseForecast } from "@/lib/forecast-parser";
import { priceCondition, validateBattery, validateOrders, type DraftOrderInput } from "@/lib/order-simulation-validation";
import type { Battery, Market, OrderSimulation, SimulatedOrderResult, SubmittedOrderType } from "@/types/api";

type DraftOrder = DraftOrderInput;
type ForecastPoint = { timestamp_utc: string; price_eur_mwh: number };
type OptionalColumn = "entered" | "limit" | "condition" | "energy" | "socBefore" | "socDelta" | "contribution" | "reason";
const OPTIONAL_COLUMNS: Array<{ id: OptionalColumn; label: string }> = [
  { id: "entered", label: "Entered volume" },
  { id: "limit", label: "Limit price" },
  { id: "condition", label: "Price condition" },
  { id: "energy", label: "Executed energy" },
  { id: "socBefore", label: "SoC before" },
  { id: "socDelta", label: "SoC change" },
  { id: "contribution", label: "Contribution" },
  { id: "reason", label: "Reason code" },
];
const DEFAULT_COLUMNS: OptionalColumn[] = ["contribution"];
const money = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
const number = (value: number, digits = 1) => new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
const time = (value: string, zone = "Europe/Zurich") =>
  new Intl.DateTimeFormat("en-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(value));
const nextId = () => `order-${crypto.randomUUID()}`;
function demoOrders(): DraftOrder[] {
  return [
    {
      id: nextId(),
      interval: 5,
      side: "BUY",
      orderType: "MARKET",
      volume: "20",
      limit: "",
    },
    {
      id: nextId(),
      interval: 6,
      side: "BUY",
      orderType: "LIMIT",
      volume: "20",
      limit: "40",
    },
    {
      id: nextId(),
      interval: 18,
      side: "SELL",
      orderType: "MARKET",
      volume: "15",
      limit: "",
    },
    {
      id: nextId(),
      interval: 19,
      side: "SELL",
      orderType: "LIMIT",
      volume: "15",
      limit: "100",
    },
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
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const [removed, setRemoved] = useState<DraftOrder>();
  const errorRef = useRef<HTMLDivElement>(null);
  const loadDemo = async (deliveryDate = date, resetOrders = false) => {
    setBusy(true);
    setError("");
    try {
      const [configuration, forecast] = await Promise.all([api<{ battery: Battery; market: Market }>("/api/configuration"), api<{ points: ForecastPoint[] }>(`/api/forecast?delivery_date=${deliveryDate}`)]);
      setBattery(configuration.battery);
      setMarket({ ...configuration.market, product_minutes: 60 });
      setPoints(forecast.points);
      setPrices(forecast.points.map((point) => String(point.price_eur_mwh)));
      if (resetOrders || !orders.length) setOrders(demoOrders());
      setResult(undefined);
      setDirty(false);
      setPasteErrors([]);
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
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  const setChanged = () => {
    setDirty(true);
    setError("");
  };
  const batteryIssues = useMemo(() => (battery ? validateBattery(battery) : {}), [battery]);
  const orderIssues = useMemo(() => (battery && market ? validateOrders(orders, market, battery, points.length) : {}), [battery, market, orders, points.length]);
  const priceIssues = useMemo(() => prices.map((value) => value.trim() === "" || !Number.isFinite(Number(value)) || Boolean(market && (Number(value) < market.min_price_eur_mwh || Number(value) > market.max_price_eur_mwh))), [prices, market]);
  const issueCount = Object.keys(batteryIssues).length + Object.keys(orderIssues).length + priceIssues.filter(Boolean).length + (prices.length === points.length ? 0 : 1);
  const inputIssue = !battery || !market || !points.length ? "Simulator configuration is still loading." : issueCount ? `${issueCount} input issue${issueCount === 1 ? "" : "s"} need attention.` : "";
  const updateOrder = (id: string, patch: Partial<DraftOrder>) => {
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...patch } : order)).sort((a, b) => a.interval - b.interval));
    setChanged();
  };
  const addOrder = () => {
    const used = new Set(orders.map((order) => order.interval));
    const interval = Math.max(
      0,
      points.findIndex((_, index) => !used.has(index)),
    );
    const created: DraftOrder = {
      id: nextId(),
      interval,
      side: "BUY",
      orderType: "LIMIT",
      volume: "10",
      limit: prices[interval] ?? "0",
    };
    setOrders((current) => [...current, created].sort((a, b) => a.interval - b.interval));
    setChanged();
  };
  const removeOrder = (order: DraftOrder) => {
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setRemoved(order);
    setChanged();
  };
  const changeDate = (value: string) => {
    if (dirty && !window.confirm("Changing the delivery date replaces the forecast and restores the example orders. Continue?")) return;
    setDate(value);
    void loadDemo(value, true);
  };
  const reset = () => {
    if (dirty && !window.confirm("Restore the demonstration forecast, battery assumptions and example orders?")) return;
    void loadDemo(date, true);
  };
  const changeBattery = (field: keyof Battery, value: number) => {
    if (battery) {
      setBattery({ ...battery, [field]: value });
      setChanged();
    }
  };
  const simulate = async () => {
    if (inputIssue || !battery || !market) {
      setError(inputIssue || "Complete the inputs before simulating.");
      setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus() ?? errorRef.current?.focus(), 0);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<OrderSimulation>("/api/order-simulations", {
        method: "POST",
        body: JSON.stringify({
          delivery_date: date,
          battery,
          market,
          price_values: prices.map(Number),
          forecast: {
            source_type: "manual",
            source_name: "Entered Day-Ahead forecast",
            version: `manual-${date}-60`,
            bidding_zone: market.bidding_zone,
          },
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
    if (!market) return;
    const parsed = parseForecast(paste, points.length, market.min_price_eur_mwh, market.max_price_eur_mwh);
    if (parsed.errors.length) {
      setPasteErrors(parsed.errors.map((item) => `${item.row ? `Row ${item.row}: ` : ""}${item.message}`));
      return;
    }
    setPrices(parsed.values.map(String));
    setChanged();
    setPaste("");
    setPasteErrors([]);
    setForecastOpen(false);
  };
  if ((!battery || !market) && error)
    return (
      <main className="simulator-loading simulator-load-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <div><strong>Order simulator unavailable</strong><span>{error} Check the backend service and try again.</span></div>
        <button className="primary compact" type="button" onClick={() => void loadDemo(date, true)}>Retry Loading</button>
        <button className="secondary compact" type="button" onClick={openOptimizer}>Open Dispatch Optimizer</button>
      </main>
    );
  if (!battery || !market)
    return (
      <div className="simulator-loading">
        <LoaderCircle className="spin" aria-hidden="true" /> Loading order simulator…
      </div>
    );
  const effectiveCharge = Math.min(battery.max_charge_power_mw, battery.grid_limit_mw);
  const effectiveDischarge = Math.min(battery.max_discharge_power_mw, battery.grid_limit_mw);
  const nominalDuration = battery.capacity_mwh / Math.max(effectiveCharge, 0.001);
  return (
    <>
      <a className="skip-link" href="#order-simulator">
        Skip to Order Simulator
      </a>
      <header className="topbar">
        <Link className="brand" href="/present/">
          <span className="logo" translate="no">
            IWB
          </span>
          <span className="brand-copy">
            <strong>BESS Day-Ahead Workbench</strong>
            <span>Order-driven battery simulation</span>
          </span>
        </Link>
        <div className="header-status">
          <Link className="header-action" href="/present/">
            <LayoutDashboard size={15} aria-hidden="true" /> Overview
          </Link>
          <Link className="header-action" href="/audit/">
            <History size={15} aria-hidden="true" /> Decision Log
          </Link>
        </div>
      </header>
      <div className="safety">
        <ShieldCheck size={16} aria-hidden="true" />
        <strong>MODELLING ENVIRONMENT</strong>
        <span>Entered forecast is used as simulated clearing price · no live order submission.</span>
      </div>
      <main id="order-simulator" className="order-simulator-page">
        <section className="simulator-hero">
          <div>
            <span className="eyebrow">IWB HOMEWORK · SWISS DAY-AHEAD</span>
            <h1>Simulate Entered Orders</h1>
            <p>Enter a price forecast and Market or Limit orders, then inspect execution, battery schedule and state of charge.</p>
          </div>
          <nav className="mode-switch" aria-label="Workbench mode">
            <span aria-current="page">Order Simulator</span>
            <button type="button" onClick={openOptimizer}>
              Advanced Optimizer
            </button>
          </nav>
        </section>
        <div className="run-context">
          <strong>{date}</strong>
          <span>Switzerland · 60-minute products</span>
          <span>
            {number(battery.capacity_mwh)} MWh · {number(effectiveCharge)} MW charge · {number(effectiveDischarge)} MW discharge · {number(nominalDuration)} h nominal
          </span>
          <button type="button" onClick={() => setBatteryOpen((value) => !value)} aria-expanded={batteryOpen} aria-controls="battery-assumptions">
            {batteryOpen ? "Hide" : "Edit"} assumptions
          </button>
        </div>
        <section className="simulator-layout">
          <aside className="simulator-inputs" aria-label="Simulation inputs">
            <div className="simulator-card compact-config">
              <div className="simulator-card-heading">
                <div>
                  <span className="step-badge">1</span>
                  <h2>Delivery &amp; Battery</h2>
                </div>
                <button type="button" className="icon-button" aria-label="Restore demo inputs" onClick={reset}>
                  <RotateCcw size={16} aria-hidden="true" />
                </button>
              </div>
              <label htmlFor="sim-date">
                Delivery date
                <input id="sim-date" name="delivery-date" type="date" autoComplete="off" value={date} onChange={(event) => changeDate(event.target.value)} />
              </label>
              {batteryOpen && (
                <div id="battery-assumptions" className="mini-field-grid">
                  <NumberField label="Energy capacity" unit="MWh" field="capacity_mwh" value={battery.capacity_mwh} issue={batteryIssues.capacity_mwh} change={changeBattery} />
                  <NumberField label="Initial SoC" unit="MWh" field="initial_soc_mwh" value={battery.initial_soc_mwh} issue={batteryIssues.initial_soc_mwh} change={changeBattery} />
                  <NumberField label="Minimum SoC" unit="MWh" field="min_soc_mwh" value={battery.min_soc_mwh} issue={batteryIssues.min_soc_mwh} change={changeBattery} />
                  <NumberField label="Maximum SoC" unit="MWh" field="max_soc_mwh" value={battery.max_soc_mwh} issue={batteryIssues.max_soc_mwh} change={changeBattery} />
                  <NumberField label="End reserve" unit="MWh" field="target_soc_mwh" value={battery.target_soc_mwh} issue={batteryIssues.target_soc_mwh} change={changeBattery} />
                  <NumberField label="Grid limit" unit="MW" field="grid_limit_mw" value={battery.grid_limit_mw} issue={batteryIssues.grid_limit_mw} change={changeBattery} />
                  <NumberField label="Charge limit" unit="MW" field="max_charge_power_mw" value={battery.max_charge_power_mw} issue={batteryIssues.max_charge_power_mw} change={changeBattery} />
                  <NumberField label="Discharge limit" unit="MW" field="max_discharge_power_mw" value={battery.max_discharge_power_mw} issue={batteryIssues.max_discharge_power_mw} change={changeBattery} />
                  <NumberField label="Round-trip efficiency" unit="ratio" field="round_trip_efficiency" step={0.01} value={battery.round_trip_efficiency} issue={batteryIssues.round_trip_efficiency} change={changeBattery} />
                  <NumberField label="Cycle budget" unit="EFC" field="max_equivalent_cycles" step={0.1} value={battery.max_equivalent_cycles} issue={batteryIssues.max_equivalent_cycles} change={changeBattery} />
                </div>
              )}
              <p className="assumption-note">
                SoC window {number(battery.min_soc_mwh)}–{number(battery.max_soc_mwh)} MWh · {number(battery.round_trip_efficiency * 100, 0)}% efficiency · {number(battery.max_equivalent_cycles)} EFC/day
              </p>
            </div>
            <div className="simulator-card">
              <div className="simulator-card-heading">
                <div>
                  <span className="step-badge">2</span>
                  <h2>Day-Ahead Forecast</h2>
                </div>
                <button type="button" className="secondary small" onClick={() => setForecastOpen((value) => !value)} aria-expanded={forecastOpen} aria-controls="forecast-editor">
                  Edit / Paste
                </button>
              </div>
              <p>Enter the simulated clearing price for each hourly delivery product.</p>
              <div className="forecast-summary">
                <strong>
                  {prices.filter(Boolean).length}/{points.length} values
                </strong>
                <span>{prices.every((item) => Number.isFinite(Number(item))) ? `${money(Math.min(...prices.map(Number)))}–${money(Math.max(...prices.map(Number)))}/MWh` : "Check prices"}</span>
              </div>
              {forecastOpen && (
                <div id="forecast-editor">
                  <textarea className="forecast-paste" name="forecast-paste" autoComplete="off" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste 24 prices, or rows such as 00:00;55…" aria-label="Paste Day-Ahead prices" />
                  <button type="button" className="secondary small" onClick={applyPaste}>
                    Apply Pasted Prices
                  </button>
                  {pasteErrors.length > 0 && (
                    <div className="field-error" role="alert">
                      {pasteErrors.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  )}
                  <div className="forecast-grid">
                    {points.map((point, index) => (
                      <label key={point.timestamp_utc} htmlFor={`forecast-${index}`}>
                        <span>{time(point.timestamp_utc, market.timezone)}</span>
                        <span className="unit-input">
                          <input
                            id={`forecast-${index}`}
                            name={`forecast-${index}`}
                            type="number"
                            inputMode="decimal"
                            autoComplete="off"
                            step={market.price_increment_eur_mwh}
                            aria-invalid={priceIssues[index]}
                            value={prices[index] ?? ""}
                            onChange={(event) => {
                              setPrices((current) => current.map((value, item) => (item === index ? event.target.value : value)));
                              setChanged();
                            }}
                          />
                          <small>€/MWh</small>
                        </span>
                        {priceIssues[index] && <small className="field-error">Invalid price</small>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
          <div className="simulator-main">
            <section className="simulator-card order-entry-card">
              <div className="simulator-card-heading">
                <div>
                  <span className="step-badge">3</span>
                  <h2>Market &amp; Limit Orders</h2>
                </div>
                <button type="button" className="secondary small" onClick={addOrder}>
                  <Plus size={15} aria-hidden="true" /> Add Order
                </button>
              </div>
              <p>Market orders pass the price condition, but execution still depends on battery and grid feasibility. Limit BUY clears at or below its maximum price; Limit SELL at or above its minimum price.</p>
              {orders.length ? (
                <div className="order-entry-list">
                  {orders.map((order, rowIndex) => (
                    <OrderRow key={order.id} order={order} rowIndex={rowIndex} points={points} prices={prices} market={market} issues={orderIssues} update={updateOrder} remove={removeOrder} />
                  ))}
                </div>
              ) : (
                <div className="state-block">
                  <strong>No orders entered</strong>
                  <span>Add a Market or Limit order to simulate battery activity.</span>
                </div>
              )}
              {removed && (
                <div className="undo-message" role="status">
                  <span>{time(points[removed.interval]?.timestamp_utc, market.timezone)} order removed</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOrders((current) => [...current, removed].sort((a, b) => a.interval - b.interval));
                      setRemoved(undefined);
                      setChanged();
                    }}
                  >
                    <Undo2 size={14} aria-hidden="true" /> Undo
                  </button>
                </div>
              )}
            </section>
            {error && (
              <div className="banner error" role="alert" tabIndex={-1} ref={errorRef}>
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <div className="simulation-action">
              <span className="step-badge">4</span>
              <div>
                <strong>Deterministic clearing simulation</strong>
                <span>The forecast is the simulated auction clearing price. No partial clearing, price impact or clearing probability is modelled.</span>
              </div>
              <button type="button" className="primary" disabled={busy || Boolean(inputIssue)} onClick={() => void simulate()}>
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} aria-hidden="true" /> Simulating…
                  </>
                ) : inputIssue ? (
                  `Resolve ${issueCount || 1} input issue${issueCount === 1 ? "" : "s"}`
                ) : result && dirty ? (
                  "Re-run Simulation"
                ) : (
                  "Simulate Clearing & Dispatch"
                )}
              </button>
            </div>
            <section aria-live="polite" aria-busy={busy}>
              {result ? (
                <div className={dirty ? "stale-results" : ""}>
                  {dirty && (
                    <div className="stale-notice" role="status">
                      <AlertTriangle size={16} aria-hidden="true" />
                      <span>
                        <strong>Previous result.</strong> Inputs changed; re-run to update the results below.
                      </span>
                    </div>
                  )}
                  <SimulationResults result={result} />
                </div>
              ) : (
                <div className="simulator-empty">
                  <span className="step-badge">5</span>
                  <h2>Review Results</h2>
                  <p>Run the simulation to see which orders meet their price condition, how SoC evolves and whether the executed schedule is physically feasible.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </main>
    </>
  );
}

function NumberField({ label, unit, field, value, step = 1, issue, change }: { label: string; unit: string; field: keyof Battery; value: number; step?: number; issue?: string; change: (field: keyof Battery, value: number) => void }) {
  const id = `battery-${field}`;
  return (
    <label htmlFor={id}>
      {label}
      <span className="unit-input">
        <input id={id} name={id} type="number" inputMode="decimal" autoComplete="off" step={step} value={value} aria-invalid={Boolean(issue)} aria-describedby={issue ? `${id}-error` : undefined} onChange={(event) => change(field, Number(event.target.value))} />
        <small>{unit}</small>
      </span>
      {issue && (
        <small id={`${id}-error`} className="field-error">
          {issue}
        </small>
      )}
    </label>
  );
}
function OrderRow({ order, rowIndex, points, prices, market, issues, update, remove }: { order: DraftOrder; rowIndex: number; points: ForecastPoint[]; prices: string[]; market: Market; issues: Record<string, string>; update: (id: string, patch: Partial<DraftOrder>) => void; remove: (order: DraftOrder) => void }) {
  const prefix = `order.${order.id}`;
  const forecast = Number(prices[order.interval]);
  const limit = Number(order.limit);
  const preview = order.orderType === "LIMIT" && Number.isFinite(forecast) && Number.isFinite(limit) ? priceCondition(order.side, forecast, limit) : undefined;
  return (
    <div className="order-entry-row">
      <span className="row-number">{rowIndex + 1}</span>
      <label className="order-delivery">
        Delivery
        <select name={`delivery-${order.id}`} aria-label={`Delivery for order ${rowIndex + 1}`} aria-invalid={Boolean(issues[`${prefix}.interval`])} value={order.interval} onChange={(event) => update(order.id, { interval: Number(event.target.value) })}>
          {points.map((point, index) => (
            <option value={index} key={point.timestamp_utc}>
              {time(point.timestamp_utc, market.timezone)}
            </option>
          ))}
        </select>
        {issues[`${prefix}.interval`] && <small className="field-error">{issues[`${prefix}.interval`]}</small>}
      </label>
      <label className="order-side">
        Side
        <select name={`side-${order.id}`} aria-label={`Side for order ${rowIndex + 1}`} value={order.side} onChange={(event) => update(order.id, { side: event.target.value as "BUY" | "SELL" })}>
          <option>BUY</option>
          <option>SELL</option>
        </select>
      </label>
      <label className="order-type">
        Type
        <select
          name={`type-${order.id}`}
          aria-label={`Type for order ${rowIndex + 1}`}
          value={order.orderType}
          onChange={(event) =>
            update(order.id, {
              orderType: event.target.value as SubmittedOrderType,
              limit: event.target.value === "MARKET" ? "" : order.limit || prices[order.interval] || "",
            })
          }
        >
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
        </select>
      </label>
      <label className="order-volume">
        Volume
        <span className="unit-input">
          <input name={`volume-${order.id}`} type="number" inputMode="decimal" autoComplete="off" step={market.volume_increment_mw} aria-label={`Volume for order ${rowIndex + 1}`} aria-invalid={Boolean(issues[`${prefix}.volume`])} value={order.volume} onChange={(event) => update(order.id, { volume: event.target.value })} />
          <small>MW</small>
        </span>
        {issues[`${prefix}.volume`] && <small className="field-error">{issues[`${prefix}.volume`]}</small>}
      </label>
      {order.orderType === "LIMIT" ? (
        <label className="order-price">
          {order.side === "BUY" ? "Maximum buy price" : "Minimum sell price"}
          <span className="unit-input">
            <input name={`limit-${order.id}`} aria-label={`Limit price for order ${rowIndex + 1}`} type="number" inputMode="decimal" autoComplete="off" step={market.price_increment_eur_mwh} aria-invalid={Boolean(issues[`${prefix}.limit`])} value={order.limit} onChange={(event) => update(order.id, { limit: event.target.value })} />
            <small>€/MWh</small>
          </span>
          {issues[`${prefix}.limit`] ? (
            <small className="field-error">{issues[`${prefix}.limit`]}</small>
          ) : (
            preview && (
              <small className={`condition-preview ${preview.passed ? "passed" : "rejected"}`}>
                {preview.passed ? "Would pass" : "Would not pass"} · {money(Math.abs(preview.marginEurMwh))}/MWh {preview.marginEurMwh >= 0 ? "inside" : "outside"}
              </small>
            )
          )}
        </label>
      ) : (
        <div className="market-condition">
          <span>Price condition</span>
          <strong>None</strong>
          <small>Market order</small>
        </div>
      )}
      <button type="button" className="icon-button remove-order" aria-label={`Remove order ${rowIndex + 1}`} onClick={() => remove(order)}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function SimulationResults({ result }: { result: OrderSimulation }) {
  const ordered = useMemo(() => [...result.order_results].sort((a, b) => a.submitted_order.delivery_start_utc.localeCompare(b.submitted_order.delivery_start_utc)), [result]);
  const [selectedId, setSelectedId] = useState<string>();
  const [columns, setColumns] = useState<OptionalColumn[]>(DEFAULT_COLUMNS);
  const marketPassed = result.summary.submitted_order_count - result.summary.not_executed_order_count;
  const summary = result.summary.infeasible_order_count ? `${result.summary.executed_order_count} of ${result.summary.submitted_order_count} orders executed; ${result.summary.infeasible_order_count} physically infeasible.` : result.summary.not_executed_order_count ? `${result.summary.executed_order_count} of ${result.summary.submitted_order_count} orders executed; ${result.summary.not_executed_order_count} did not meet the price condition.` : `All ${result.summary.executed_order_count} submitted orders executed.`;
  const toggle = (id: OptionalColumn) => setColumns((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current));
  return (
    <div className="simulation-results">
      <div className={`result-verdict ${result.executed_schedule_feasible ? "passed" : "failed"}`}>
        <div>
          {result.executed_schedule_feasible ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          <span>
            <strong>{summary}</strong>
            <small>The resulting battery schedule is {result.executed_schedule_feasible ? "physically feasible" : "not physically feasible"}.</small>
          </span>
        </div>
        <strong>{money(result.summary.net_contribution_eur)}</strong>
      </div>
      <div className="result-checks">
        <StatusCheck title="Submitted portfolio" passed={result.submitted_portfolio_feasible} detail={`${marketPassed} passed price condition · ${result.summary.not_executed_order_count} rejected · ${result.summary.infeasible_order_count} infeasible`} />
        <StatusCheck title="Executed schedule" passed={result.executed_schedule_feasible} detail={`${result.summary.executed_order_count} executed · chronological SoC validated`} />
      </div>
      <div className="simulator-card">
        <DispatchChart rows={result.dispatch} battery={result.battery} forecast={result.forecast} mode="order-simulation" executedOrderCount={result.summary.executed_order_count} submittedOrderCount={result.summary.submitted_order_count} orderResults={ordered} selectedOrderId={selectedId} onSelectOrder={setSelectedId} />
      </div>
      <div className="simulation-kpis">
        <Kpi label="Net contribution" value={money(result.summary.net_contribution_eur)} detail="SELL revenue − BUY purchases − costs" />
        <Kpi label="Executed orders" value={`${result.summary.executed_order_count}/${result.summary.submitted_order_count}`} detail={`${result.summary.not_executed_order_count} price-rejected`} />
        <Kpi label="Final SoC" value={`${number(result.summary.final_soc_mwh)} MWh`} detail={`started at ${number(result.summary.initial_soc_mwh)} MWh`} />
      </div>
      <div className="simulator-card execution-card">
        <div className="simulator-card-heading">
          <div>
            <span className="step-badge">5</span>
            <h2>Order Outcomes</h2>
          </div>
          <details className="column-picker">
            <summary>
              <Columns3 size={15} aria-hidden="true" /> Columns · {6 + columns.length}
            </summary>
            <div className="column-menu">
              <strong>Additional evidence</strong>
              <span>Choose up to 3 columns.</span>
              {OPTIONAL_COLUMNS.map((column) => (
                <label className="column-option" key={column.id}>
                  <input type="checkbox" checked={columns.includes(column.id)} disabled={!columns.includes(column.id) && columns.length >= 3} onChange={() => toggle(column.id)} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="table-scroll">
          <table className="execution-table">
            <caption className="sr-only">Submitted order clearing and physical execution results</caption>
            <thead>
              <tr>
                <th scope="col">Delivery</th>
                <th scope="col">Order</th>
                <th scope="col" className="numeric">
                  Forecast
                </th>
                <th scope="col">Outcome</th>
                <th scope="col" className="numeric">
                  Executed
                </th>
                <th scope="col" className="numeric">
                  SoC after
                </th>
                {columns.map((column) => (
                  <th scope="col" key={column}>
                    {columnLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((item) => (
                <OutcomeRows key={item.submitted_order.client_order_id} item={item} selected={selectedId === item.submitted_order.client_order_id} columns={columns} zone={result.market.timezone} select={() => setSelectedId((current) => (current === item.submitted_order.client_order_id ? undefined : item.submitted_order.client_order_id))} />
              ))}
            </tbody>
          </table>
        </div>
        {result.validation.findings.length > 0 && (
          <div className="validation-findings">
            <strong>Validation findings</strong>
            {result.validation.findings.map((finding, index) => (
              <p key={`${finding.code}-${index}`}>
                {finding.interval != null ? `${time(result.dispatch[finding.interval].timestamp_utc, result.market.timezone)} · ` : ""}
                {finding.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function OutcomeRows({ item, selected, columns, zone, select }: { item: SimulatedOrderResult; selected: boolean; columns: OptionalColumn[]; zone: string; select: () => void }) {
  const order = item.submitted_order;
  const outcome = item.execution_status === "EXECUTED" ? "Executed" : item.execution_status === "NOT_EXECUTED" ? "Price condition not met" : "Physically infeasible";
  return (
    <>
      <tr
        className={selected ? "selected" : ""}
        tabIndex={0}
        aria-expanded={selected}
        onClick={select}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        }}
      >
        <td>{time(order.delivery_start_utc, zone)}</td>
        <td>
          <strong>
            {order.order_type} {order.side}
          </strong>
          <small>{number(order.volume_mw)} MW</small>
        </td>
        <td className="numeric">{money(item.forecast_price_eur_mwh)}</td>
        <td>
          <span className={`execution-status ${item.execution_status.toLowerCase()}`}>{outcome}</span>
        </td>
        <td className="numeric">{number(item.executed_volume_mw)} MW</td>
        <td className="numeric">{number(item.soc_after_mwh)} MWh</td>
        {columns.map((column) => (
          <td key={column} className={column === "contribution" ? (item.contribution_eur >= 0 ? "numeric positive" : "numeric negative") : "numeric"}>
            {columnValue(column, item)}
          </td>
        ))}
      </tr>
      {selected && (
        <tr className="evidence-row">
          <td colSpan={6 + columns.length}>
            <div>
              <strong>Calculation evidence</strong>
              <span>{order.order_type === "MARKET" ? "Market order—no limit-price condition." : `${money(item.forecast_price_eur_mwh)}/MWh ${item.price_condition_operator === "<=" ? "≤" : "≥"} ${money(order.limit_price_eur_mwh ?? 0)}/MWh · ${item.price_condition_passed ? "passed" : "failed"} by ${money(Math.abs(item.price_margin_eur_mwh ?? 0))}/MWh.`}</span>
              <span>
                Requested {number(order.volume_mw)} MW · executed {number(item.executed_volume_mw)} MW / {number(item.executed_energy_mwh)} MWh.
              </span>
              <span>
                SoC {number(item.soc_before_mwh)} → {number(item.soc_after_mwh)} MWh ({item.soc_delta_mwh >= 0 ? "+" : ""}
                {number(item.soc_delta_mwh)} MWh) · contribution {money(item.contribution_eur)}.
              </span>
              <span>{item.reason}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
function columnLabel(column: OptionalColumn) {
  return {
    entered: "Entered",
    limit: "Limit",
    condition: "Condition",
    energy: "Energy",
    socBefore: "SoC before",
    socDelta: "SoC change",
    contribution: "Contribution",
    reason: "Reason",
  }[column];
}
function columnValue(column: OptionalColumn, item: SimulatedOrderResult) {
  const order = item.submitted_order;
  if (column === "entered") return `${number(order.volume_mw)} MW`;
  if (column === "limit") return order.limit_price_eur_mwh == null ? "—" : `${order.side === "BUY" ? "≤" : "≥"} ${money(order.limit_price_eur_mwh)}`;
  if (column === "condition") return order.order_type === "MARKET" ? "Not applicable" : item.price_condition_passed ? `Passed ${money(Math.abs(item.price_margin_eur_mwh ?? 0))}` : `Failed ${money(Math.abs(item.price_margin_eur_mwh ?? 0))}`;
  if (column === "energy") return `${number(item.executed_energy_mwh)} MWh`;
  if (column === "socBefore") return `${number(item.soc_before_mwh)} MWh`;
  if (column === "socDelta") return `${item.soc_delta_mwh >= 0 ? "+" : ""}${number(item.soc_delta_mwh)} MWh`;
  if (column === "contribution") return money(item.contribution_eur);
  return item.reason_code.replaceAll("_", " ");
}
function StatusCheck({ title, passed, detail }: { title: string; passed: boolean; detail: string }) {
  return (
    <div className={`status-check ${passed ? "passed" : "failed"}`}>
      {passed ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="sim-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
