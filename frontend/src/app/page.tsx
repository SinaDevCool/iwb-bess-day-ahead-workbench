"use client";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  History,
  LayoutDashboard,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { DispatchChart } from "@/components/dispatch-chart";
import { IntervalResultsTable } from "@/components/interval-results-table";
import { Kpi } from "@/components/kpi";
import { OrderTable } from "@/components/order-table";
import {
  EconomicsPanel,
  OrderTimeline,
} from "@/components/analytics-charts";
import { SavedRunComparison } from "@/components/comparison/saved-run-comparison";
import { api, download } from "@/lib/api";
import type { Battery, Market, Order, Simulation, SimulationSummary } from "@/types/api";

const defaultBattery: Battery = {
  capacity_mwh: 100,
  max_charge_power_mw: 50,
  max_discharge_power_mw: 50,
  initial_soc_mwh: 50,
  min_soc_mwh: 10,
  max_soc_mwh: 90,
  target_soc_mwh: 50,
  round_trip_efficiency: 0.9,
  degradation_cost_eur_per_mwh: 3,
  max_equivalent_cycles: 1.5,
  grid_limit_mw: 50,
  unavailable_intervals: [],
};
const defaultMarket: Market = {
  market_name: "Swiss Day-Ahead (configuration assumption)",
  bidding_zone: "CH",
  currency: "EUR",
  timezone: "Europe/Zurich",
  product_minutes: 60,
  gate_closure_local: "12:00",
  volume_increment_mw: 0.1,
  price_increment_eur_mwh: 0.01,
  min_price_eur_mwh: -500,
  max_price_eur_mwh: 4000,
  exchange_fee_eur_per_mwh: 0,
  exchange_fee_policy: "excluded",
  clearing_fee_eur_per_mwh: 0.015,
  assumptions_unverified: true,
};
const tabs = [
  ["schedule", "Dispatch & Economics"],
  ["orders", "Auction Orders"],
  ["proof", "Physical Validation"],
  ["compare", "Compare Runs"],
] as const;
type TabKey = (typeof tabs)[number][0];
const compactTabLabels: Record<TabKey, string> = {
  schedule: "Dispatch",
  orders: "Orders",
  proof: "Validation",
  compare: "Compare",
};

export default function Workbench() {
  const [battery, setBattery] = useState(defaultBattery),
    [market, setMarket] = useState(defaultMarket),
    [date, setDate] = useState("2026-09-09"),
    [scenario, setScenario] = useState("Expected forecast"),
    [strategy, setStrategy] = useState("expected_value"),
    [riskPosture, setRiskPosture] = useState("balanced"),
    [horizonPolicy, setHorizonPolicy] = useState("minimum_reserve"),
    [terminalValue, setTerminalValue] = useState(55),
    [priceMultiplier, setPriceMultiplier] = useState(1),
    [scenarioProbabilities, setScenarioProbabilities] = useState({ downside: 20, expected: 60, upside: 20 }),
    [lookaheadHours, setLookaheadHours] = useState(4),
    [forecastSource, setForecastSource] = useState<"illustrative" | "manual">("illustrative"),
    [manualPrices, setManualPrices] = useState(""),
    [policyAdvanced, setPolicyAdvanced] = useState(false),
    [peak, setPeak] = useState(0),
    [availability, setAvailability] = useState("Fully available"),
    [unavailable, setUnavailable] = useState("");
  const [result, setResult] = useState<Simulation>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ kind: string; text: string } | null>(
      null,
    ),
    [dirty, setDirty] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [inputsCollapsed, setInputsCollapsed] = useState(false),
    [tab, setTab] = useState<TabKey>("schedule"),
    [selected, setSelected] = useState<Order>(),
    [volume, setVolume] = useState(""),
    [price, setPrice] = useState(""),
    [comment, setComment] = useState(""),
    [exclude, setExclude] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const run = async () => {
    const parsedPrices = manualPrices.split(/[\s,;]+/).filter(Boolean).map(Number);
    const expectedPriceCount = market.product_minutes === 15 ? 96 : 24;
    if (forecastSource === "manual" && (parsedPrices.length !== expectedPriceCount || parsedPrices.some((value) => !Number.isFinite(value)))) {
      setMessage({ kind: "error", text: `Manual forecast requires exactly ${expectedPriceCount} valid prices for this product.` });
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    const error = validate(battery, market, date, unavailable, scenarioProbabilities);
    if (error) {
      setMessage({ kind: "error", text: error });
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await api<Simulation>("/api/simulations", {
        method: "POST",
        body: JSON.stringify({
          delivery_date: date,
          scenario_name: scenario,
          battery: {
            ...battery,
            unavailable_intervals: parseIntervals(unavailable, market.product_minutes),
          },
          market,
          strategy,
          risk_posture: riskPosture,
          horizon_policy: horizonPolicy,
          terminal_value_eur_per_mwh: terminalValue,
          price_multiplier: priceMultiplier,
          peak_reduction_eur_mwh: peak,
          scenario_probabilities: {
            downside: scenarioProbabilities.downside / 100,
            expected: scenarioProbabilities.expected / 100,
            upside: scenarioProbabilities.upside / 100,
          },
          lookahead_hours: lookaheadHours,
          price_values: forecastSource === "manual" ? parsedPrices : undefined,
          forecast: { source_type: forecastSource, source_name: forecastSource === "manual" ? "Trader manual forecast" : "IWB illustrative profile", version: forecastSource === "manual" ? `manual-${date}-${market.product_minutes}` : "illustrative-v1", bidding_zone: market.bidding_zone },
        }),
      });
      setResult(next);
      setDirty(false);
      setSelected(undefined);
      setMessage({
        kind: next.validation.status === "passed" ? "success" : "error",
        text:
          "Optimization complete: " +
          next.dispatch.length +
          " × " +
          next.market.product_minutes +
          "-minute delivery intervals; " +
          next.orders.length +
          " draft orders generated; validation " +
          next.validation.status +
          ".",
      });
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e instanceof Error ? e.message : "Simulation failed") +
          ". Review the inputs and run again.",
      });
    } finally {
      setBusy(false);
    }
  };
  // Viewing the workbench must not create an audit event. Restore the most
  // recent saved decision as read-only context; only the Run button writes.
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ battery: Battery; market: Market }>("/api/configuration"),
      api<{ items: Simulation[] }>("/api/simulations"),
    ])
      .then(([configuration, { items }]) => {
        if (!active) return;
        setBattery(configuration.battery);
        setMarket(configuration.market);
        if (!items.length) return;
        const latest = items[0];
        setResult(latest);
        setBattery(latest.battery);
        // Historical audit records may predate newly introduced configuration
        // fields. Merge them over current defaults so the form remains complete.
        setMarket({ ...configuration.market, ...latest.market });
        setDate(latest.delivery_date);
        setScenario(latest.scenario_name);
        setStrategy(latest.strategy ?? "expected_value");
        setRiskPosture(latest.risk_posture ?? "balanced");
        setHorizonPolicy(latest.horizon_policy ?? "minimum_reserve");
        setTerminalValue(latest.terminal_value_eur_per_mwh ?? 55);
        setPriceMultiplier(latest.price_multiplier ?? 1);
        setScenarioProbabilities({ downside: (latest.scenario_probabilities?.downside ?? .2) * 100, expected: (latest.scenario_probabilities?.expected ?? .6) * 100, upside: (latest.scenario_probabilities?.upside ?? .2) * 100 });
        setLookaheadHours(latest.lookahead_hours ?? 4);
        setForecastSource(latest.forecast?.source_type === "manual" ? "manual" : "illustrative");
        setManualPrices(latest.forecast?.source_type === "manual" ? (latest.forecast_points ?? []).map((point) => point.price_eur_mwh).join(", ") : "");
        setPeak(latest.peak_reduction_eur_mwh ?? 0);
        setUnavailable(intervalsToWindows(latest.battery.unavailable_intervals, latest.market.product_minutes));
        setAvailability(latest.battery.unavailable_intervals.length ? "Custom" : "Fully available");
        setMessage({
          kind: "info",
          text: "Latest saved run loaded. Change inputs and run the optimization to create a new decision record.",
        });
      })
      .catch((error) => {
        if (active) setMessage({ kind: "error", text: `${error instanceof Error ? error.message : "Configuration unavailable"}. Backend defaults could not be loaded.` });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const restoreTab = () => {
      const parameters = new URLSearchParams(location.search);
      const requested = parameters.get("tab");
      if (tabs.some(([key]) => key === requested)) setTab(requested as TabKey);
      const panel = parameters.get("panel");
      setInputsCollapsed(panel === "collapsed" || (panel === null && matchMedia("(max-width: 700px)").matches));
    };
    restoreTab();
    addEventListener("popstate", restoreTab);
    return () => removeEventListener("popstate", restoreTab);
  }, []);
  const change = () => {
    if (result) setDirty(true);
    setSelected(undefined);
    setMessage(null);
  };
  const chooseTab = (key: TabKey) => {
    setTab(key);
    const url = new URL(location.href);
    url.searchParams.set("tab", key);
    history.replaceState({}, "", url);
  };
  const toggleInputs = () => {
    const next = !inputsCollapsed;
    setInputsCollapsed(next);
    const url = new URL(location.href);
    if (next) url.searchParams.set("panel", "collapsed");
    else url.searchParams.delete("panel");
    history.replaceState({}, "", url);
  };
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.length - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    chooseTab(tabs[n][0]);
    document.getElementById("tab-" + tabs[n][0])?.focus();
  };
  const batteryChange = (key: keyof Battery, value: number) => {
    setBattery((x) => ({ ...x, [key]: value }));
    change();
  };
  const reset = () => {
    setBattery(defaultBattery);
    setMarket(defaultMarket);
    setDate("2026-09-09");
    setScenario("Expected forecast");
    setStrategy("expected_value");
    setRiskPosture("balanced");
    setHorizonPolicy("minimum_reserve");
    setTerminalValue(55);
    setPeak(0);
    setPriceMultiplier(1);
    setScenarioProbabilities({ downside: 20, expected: 60, upside: 20 });
    setLookaheadHours(4);
    setAvailability("Fully available");
    setUnavailable("");
    setDirty(true);
    setMessage({
      kind: "info",
      text: "Default inputs restored. Run the optimization to refresh results.",
    });
  };
  const outage = (value: string) => {
    setAvailability(value);
    change();
    setUnavailable(
      value === "Morning outage"
        ? "06:00–08:00"
        : value === "Evening peak outage"
          ? "18:00–20:00"
          : value === "Custom"
            ? unavailable
            : "",
    );
  };
  const chooseOrder = (o: Order) => {
    setSelected(o);
    setVolume(String(o.volume_mw));
    setPrice(String(o.limit_price_eur_mwh));
    setComment("");
    setExclude(false);
  };
  const edit = async () => {
    if (!result || !selected) return;
    setBusy(true);
    try {
      const next = await api<Simulation>(
        "/api/order-proposals/" + result.simulation_id,
        {
          method: "PATCH",
          body: JSON.stringify({ adjustments: [exclude
            ? { order_id: selected.order_id, exclude: true, comment: comment.trim() }
            : {
                order_id: selected.order_id,
                volume_mw: Number(volume),
                limit_price_eur_mwh: Number(price),
                exclude: false,
                comment: comment.trim(),
              }],
          }),
        },
      );
      setResult(next);
      setSelected(undefined);
      setMessage({
        kind: next.validation.status === "passed" ? "success" : "error",
        text:
          "Trader change recorded. Validation " + next.validation.status + ".",
      });
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e instanceof Error ? e.message : "Order edit failed") +
          ". Correct the order and retry.",
      });
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const x = await api<{ approval_status: string }>(
        "/api/order-proposals/" + result.simulation_id + "/approve",
        { method: "POST" },
      );
      setResult({
        ...result,
        approval_status: x.approval_status,
        orders: result.orders.map((o) => ({ ...o, status: "APPROVED" })),
      });
      setMessage({
        kind: "success",
        text: "Approved for demo export. No external submission occurred.",
      });
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e instanceof Error ? e.message : "Approval failed") +
          ". Resolve validation findings first.",
      });
    } finally {
      setBusy(false);
    }
  };
  const exportProposal = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await download(`/api/order-proposals/${result.simulation_id}/exports`, `${result.simulation_id}-orders.csv`);
      setMessage({ kind: "success", text: "CSV exported and recorded in the Decision Log." });
    } catch (error) {
      setMessage({ kind: "error", text: `${error instanceof Error ? error.message : "Export failed"}. Confirm the current proposal is validated and approved.` });
    } finally {
      setBusy(false);
    }
  };
  const summary: Partial<SimulationSummary> = result?.summary ?? {},
    resultBattery = result?.battery ?? battery,
    resultMarket = result?.market ?? market,
    cyclePct = Math.min(
      100,
      ((summary.equivalent_cycles ?? 0) / resultBattery.max_equivalent_cycles) * 100,
    ),
    dst =
      result &&
      result.dispatch.length !== (resultMarket.product_minutes === 60 ? 24 : 96),
    draftChanges = result ? configurationChanges(result, battery, market, scenario, riskPosture, horizonPolicy, terminalValue, unavailable) : [];
  return (
    <>
      <a className="skip-link" href="#workbench">
        Skip to Workbench
      </a>
      <header className="topbar">
        <Link
          className="brand"
          href="/present/"
          aria-label="Return to product overview"
          onClick={(event) => { if (dirty && !confirm("Discard unsimulated changes and return to the Overview?")) event.preventDefault(); }}
        >
          <span className="logo" translate="no">
            IWB
          </span>
          <span className="brand-copy">
            <strong>BESS Day-Ahead Workbench</strong>
            <span>Spot trading decision support</span>
          </span>
        </Link>
        <div className="header-status">
          <Link className="header-action" href="/present/" onClick={(event) => { if (dirty && !confirm("Discard unsimulated changes and return to the Overview?")) event.preventDefault(); }}>
            <LayoutDashboard size={15} aria-hidden="true" /> Overview
          </Link>
          <Link className="header-action" href="/audit/" onClick={(event) => { if (dirty && !confirm("Discard unsimulated changes and open the Decision Log?")) event.preventDefault(); }}>
            <History size={15} aria-hidden="true" /> Decision Log
          </Link>
          <span
            className="pill"
            title="Assumed Day-Ahead auction gate closure; confirm with IWB"
          >
            <Clock3 size={14} aria-hidden="true" />
            Gate closure assumption · {market.gate_closure_local}{" "}
            <span className="desktop-only">{market.timezone}*</span>
          </span>
        </div>
      </header>
      <div className="safety">
        <ShieldCheck size={16} aria-hidden="true" />
        <strong>MODELLING ENVIRONMENT</strong>
        <span>
          Illustrative Day-Ahead price forecast · no live market feed or order
          submission.
        </span>
      </div>
      <main id="workbench">
        <section className="context-bar">
          <div>
            <span className="eyebrow">BESS DAY-AHEAD AUCTION</span>
            <h1>Battery Dispatch &amp; Order Optimizer</h1>
            <p>
              {formatDate(date)} · {market.bidding_zone} ·{" "}
              {market.product_minutes}-minute products
            </p>
          </div>
        </section>
        <section className={`workspace${inputsCollapsed ? " sidebar-collapsed" : ""}`}>
          <aside className={`panel inputs${inputsCollapsed ? " collapsed" : ""}`} aria-label="Market and battery configuration">
            <div className="panel-title">
              {!inputsCollapsed && <div>
                <span>01</span>
                <h2 id="input-title">Configure Market &amp; Battery</h2>
              </div>}
              {inputsCollapsed && <div className="collapsed-context">
                <strong>Configure Case</strong>
                <span>{scenario} · {riskPosture.replaceAll("_", " ")} · {battery.capacity_mwh} MWh</span>
              </div>}
              <div className="panel-title-actions">
                {!inputsCollapsed && <button
                  className="icon-button"
                  onClick={reset}
                  aria-label="Reset all inputs"
                  title="Reset case inputs"
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>}
                <button
                  className="icon-button panel-collapse-button"
                  type="button"
                  onClick={toggleInputs}
                  aria-controls="configuration-content"
                  aria-expanded={!inputsCollapsed}
                  aria-label={inputsCollapsed ? "Expand configuration panel" : "Collapse configuration panel"}
                  title={inputsCollapsed ? "Expand configuration" : "Collapse configuration"}
                >
                  {inputsCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div id="configuration-content" className="inputs-content">
            <fieldset className="config-group market-config">
              <legend>
                <span className="config-step">1</span>
                <span className="config-legend-copy"><strong>Market &amp; Costs</strong><small>Delivery setup &amp; trading costs</small></span>
              </legend>
              <p className="section-intro">Set the delivery product, illustrative price case and marginal execution costs.</p>
              <label htmlFor="date">
                Delivery date
                <input
                  id="date"
                  name="date"
                  autoComplete="off"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    change();
                  }}
                />
              </label>
              <label htmlFor="duration">
                Product duration <span className="assumption">assumption</span>
                <select
                  id="duration"
                  name="duration"
                  autoComplete="off"
                  value={market.product_minutes}
                  onChange={(e) => {
                    setMarket({
                      ...market,
                      product_minutes: Number(e.target.value) as 15 | 60,
                    });
                    change();
                  }}
                >
                  <option value="60">60 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
                <small>
                  {market.product_minutes === 15
                    ? "Quarter-hour products: normally 96 delivery intervals per day."
                    : "Hourly products: normally 24 delivery intervals per day."}
                </small>
              </label>
              <label htmlFor="scenario">
                Day-Ahead price scenario{" "}
                <span className="assumption">illustrative</span>
                <select
                  id="scenario"
                  name="scenario"
                  autoComplete="off"
                  value={scenario}
                  onChange={(e) => {
                    const v = e.target.value;
                    setScenario(v);
                    setStrategy("expected_value");
                    setPriceMultiplier(v === "Upside" ? 1.08 : 1);
                    setPeak(v === "Downside" ? 15 : v === "Peak compression" ? 25 : 0);
                    change();
                  }}
                >
                  <option>Expected forecast</option>
                  <option>Downside</option>
                  <option>Peak compression</option>
                  <option>Upside</option>
                </select>
                <small>{scenarioDescription(scenario)}</small>
              </label>
              <div className="forecast-source-block">
                <label htmlFor="forecast-source">Forecast source
                  <select id="forecast-source" name="forecast-source" autoComplete="off" value={forecastSource} onChange={(e) => { setForecastSource(e.target.value as "illustrative" | "manual"); change(); }}>
                    <option value="illustrative">Illustrative demo</option>
                    <option value="manual">Manual price series</option>
                  </select>
                  <small>{forecastSource === "illustrative" ? "Built-in demonstration profile · version illustrative-v1" : `Enter ${market.product_minutes === 15 ? 96 : 24} chronological prices in €/MWh.`}</small>
                </label>
                {forecastSource === "manual" && <label htmlFor="manual-prices">Forecast prices
                  <textarea id="manual-prices" name="manual-prices" autoComplete="off" rows={4} placeholder="55, 50, 45, 40, …" value={manualPrices} onChange={(e) => { setManualPrices(e.target.value); change(); }} />
                  <small>{manualPrices.split(/[\s,;]+/).filter(Boolean).length} / {market.product_minutes === 15 ? 96 : 24} prices · delivery zone {market.bidding_zone}</small>
                </label>}
              </div>
              <div className="fee-policy">
                <label className="check-label" htmlFor="include-exchange-fee">
                  <input id="include-exchange-fee" type="checkbox" checked={market.exchange_fee_policy === "configured"} onChange={(e) => { setMarket({ ...market, exchange_fee_policy: e.target.checked ? "configured" : "excluded" }); change(); }} />
                  Include contractual exchange fee
                </label>
                <small>{market.exchange_fee_policy === "configured" ? "Configured marginal fee is included on every executed MWh." : "Not configured · excluded from optimization until confirmed with IWB."}</small>
              </div>
              <div className="field-grid">
                <NF
                  id="exchange-fee"
                  label="Exchange trading fee"
                  hint="Contract-specific; confirm with IWB"
                  value={market.exchange_fee_eur_per_mwh}
                  unit="€/MWh"
                  min={0}
                  step=".001"
                  badge="confirmation required"
                  disabled={market.exchange_fee_policy !== "configured"}
                  change={(v) => { setMarket({ ...market, exchange_fee_eur_per_mwh: v }); change(); }}
                />
                <NF
                  id="clearing-fee"
                  label="ECC clearing fee"
                  hint="Public 2026 price list: €0.015/MWh"
                  value={market.clearing_fee_eur_per_mwh}
                  unit="€/MWh"
                  min={0}
                  step=".001"
                  badge="public tariff"
                  change={(v) => { setMarket({ ...market, clearing_fee_eur_per_mwh: v }); change(); }}
                />
              </div>
              <small>Both fees apply to every executed MWh, whether BUY or SELL. Fixed membership costs are excluded from dispatch optimization.</small>
            </fieldset>
            <fieldset className="config-group policy-config">
              <legend>
                <span className="config-step">2</span>
                <span className="config-legend-copy"><strong>Optimization Policy</strong><small>Risk preference &amp; terminal value</small></span>
              </legend>
              <p className="section-intro">Choose how uncertainty and stored energy after the delivery day should be valued.</p>
              <label htmlFor="risk-posture">
                Decision posture
                <select id="risk-posture" name="risk-posture" autoComplete="off" value={riskPosture} onChange={(e) => { setRiskPosture(e.target.value); change(); }}>
                  <option value="expected_value">Expected value</option>
                  <option value="balanced">Balanced</option>
                  <option value="downside_protected">Downside protected</option>
                </select>
                <small>Selects the preferred portfolio after testing schedules across downside, expected and upside prices.</small>
              </label>
              <label htmlFor="horizon-policy">
                End-of-day energy policy
                <select id="horizon-policy" name="horizon-policy" autoComplete="off" value={horizonPolicy} onChange={(e) => { setHorizonPolicy(e.target.value); change(); }}>
                  <option value="minimum_reserve">Minimum reserve only</option>
                  <option value="terminal_value">Configured terminal value</option>
                  <option value="next_day_proxy">Next-day forecast proxy</option>
                  <option value="multi_day">Multi-day opportunity value</option>
                </select>
                <small>Controls how energy remaining after the auction day is valued.</small>
              </label>
              {horizonPolicy === "terminal_value" && <NF id="terminal-value" label="Terminal energy value" hint="Illustrative value for stored energy above the end-of-day reserve" value={terminalValue} unit="€/MWh" min={0} change={(v) => { setTerminalValue(v); change(); }} />}
              {(horizonPolicy === "next_day_proxy" || horizonPolicy === "multi_day") && <NF id="lookahead-hours" label="Next-day look-ahead" hint={horizonPolicy === "multi_day" ? "Values ending energy against the best opportunity in the continuation window; only the delivery day is ordered" : "Uses the earliest next-day forecast intervals as a replacement-value proxy"} value={lookaheadHours} unit="hours" min={1} max={24} change={(v) => { setLookaheadHours(v); change(); }} />}
              <button className="advanced-toggle" type="button" aria-expanded={policyAdvanced} aria-controls="scenario-probability-editor" onClick={() => setPolicyAdvanced((value) => !value)}><SlidersHorizontal size={15} aria-hidden="true" /> Scenario probabilities</button>
              {policyAdvanced && (
                <ScenarioProbabilityEditor
                  value={scenarioProbabilities}
                  onChange={(next) => { setScenarioProbabilities(next); change(); }}
                />
              )}
            </fieldset>
            <fieldset className="config-group battery-config">
              <legend>
                <span className="config-step">3</span>
                <span className="config-legend-copy"><strong>Battery &amp; Availability</strong><small>Physical limits &amp; outages</small></span>
              </legend>
              <p className="section-intro">Define the executable operating envelope. These limits are enforced by the optimizer.</p>
              <div className="assumption-note">
                <BatteryCharging size={16} aria-hidden="true" />
                <span>
                  <strong>Task baseline</strong>
                  100 MWh capacity · 50 MW charge/discharge · 2-hour duration
                </span>
              </div>
              <div className="derived-strip" role="status">
                <span><b>{num(Math.min(battery.max_charge_power_mw, battery.grid_limit_mw), 1)} MW</b> effective charge</span>
                <span><b>{num(Math.min(battery.max_discharge_power_mw, battery.grid_limit_mw), 1)} MW</b> effective discharge</span>
                <span><b>{num(battery.capacity_mwh / Math.max(.0001, Math.min(battery.max_charge_power_mw, battery.grid_limit_mw)), 1)} h</b> charge duration</span>
              </div>
              <div className="field-grid">
                <NF
                  id="capacity"
                  label="Energy capacity"
                  hint="Task input: 100 MWh"
                  value={battery.capacity_mwh}
                  unit="MWh"
                  min={1}
                  assumption
                  change={(v) => batteryChange("capacity_mwh", v)}
                />
                <NF
                  id="charge-power"
                  label="Charge limit"
                  hint="Task input: 50 MW"
                  value={battery.max_charge_power_mw}
                  unit="MW"
                  min={0.1}
                  assumption
                  change={(v) => batteryChange("max_charge_power_mw", v)}
                />
                <NF
                  id="discharge-power"
                  label="Discharge limit"
                  hint="Task input: 50 MW"
                  value={battery.max_discharge_power_mw}
                  unit="MW"
                  min={0.1}
                  assumption
                  change={(v) => batteryChange("max_discharge_power_mw", v)}
                />
                <NF
                  id="grid-limit"
                  label="Grid connection limit"
                  hint="Assumption: 50 MW"
                  value={battery.grid_limit_mw}
                  unit="MW"
                  min={0.1}
                  assumption
                  change={(v) => batteryChange("grid_limit_mw", v)}
                />
                <NF
                  id="initial"
                  label="Initial SoC"
                  hint="Stored energy at 00:00"
                  value={battery.initial_soc_mwh}
                  unit="MWh"
                  min={0}
                  max={battery.capacity_mwh}
                  change={(v) => batteryChange("initial_soc_mwh", v)}
                />
                <NF
                  id="target"
                  label="Minimum end-of-day SoC"
                  hint="Required reserve; optimizer may finish above it"
                  value={battery.target_soc_mwh}
                  unit="MWh"
                  min={0}
                  max={battery.capacity_mwh}
                  change={(v) => batteryChange("target_soc_mwh", v)}
                />
                <NF
                  id="min"
                  label="Minimum SoC"
                  value={battery.min_soc_mwh}
                  unit="MWh"
                  min={0}
                  max={battery.capacity_mwh}
                  change={(v) => batteryChange("min_soc_mwh", v)}
                />
                <NF
                  id="max"
                  label="Maximum SoC"
                  value={battery.max_soc_mwh}
                  unit="MWh"
                  min={0}
                  max={battery.capacity_mwh}
                  change={(v) => batteryChange("max_soc_mwh", v)}
                />
                <NF
                  id="efficiency"
                  label="Round-trip efficiency"
                  value={battery.round_trip_efficiency * 100}
                  unit="%"
                  min={1}
                  max={100}
                  change={(v) =>
                    batteryChange("round_trip_efficiency", v / 100)
                  }
                />
                <NF
                  id="degradation"
                  label="Degradation cost"
                  value={battery.degradation_cost_eur_per_mwh}
                  unit="€/MWh"
                  min={0}
                  change={(v) =>
                    batteryChange("degradation_cost_eur_per_mwh", v)
                  }
                />
                <NF
                  id="cycles"
                  label="Daily cycle budget"
                  hint="Equivalent full cycles"
                  value={battery.max_equivalent_cycles}
                  unit="EFC"
                  step=".1"
                  min={0.1}
                  change={(v) => batteryChange("max_equivalent_cycles", v)}
                />
              </div>
              <div className="subsection-label">Asset availability</div>
              <label htmlFor="availability">
                Availability preset
                <select
                  id="availability"
                  name="availability"
                  autoComplete="off"
                  value={availability}
                  onChange={(e) => outage(e.target.value)}
                >
                  <option>Fully available</option>
                  <option>Morning outage</option>
                  <option>Evening peak outage</option>
                  <option>Custom</option>
                </select>
              </label>
              <button
                className="advanced-toggle"
                type="button"
                aria-expanded={advanced}
                onClick={() => setAdvanced((x) => !x)}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                Advanced Interval Input
              </button>
              {advanced && (
                <label htmlFor="intervals">
                  Unavailable local-time windows
                  <input
                    id="intervals"
                    name="intervals"
                    autoComplete="off"
                    placeholder="Example: 06:00–08:00, 18:00–20:00"
                    value={unavailable}
                    onChange={(e) => {
                      setUnavailable(e.target.value);
                      setAvailability("Custom");
                      change();
                    }}
                  />
                  <small>Europe/Zurich delivery time. Windows are remapped when product duration changes.</small>
                </label>
              )}
            </fieldset>
            <button
              className="primary run-button"
              onClick={() => void run()}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="spinner" size={18} />
              ) : (
                <Play size={18} />
              )}{" "}
              {busy
                ? "Optimizing…"
                : result
                  ? "Re-run Optimization"
                  : "Run Optimization"}
            </button>
            </div>
          </aside>
          <div className="main-column">
            <section className="kpis" aria-label={dirty && result ? "Previous optimization summary; rerun required" : "Optimization summary"}>
              <Kpi
                label="Day-Ahead Cash Contribution"
                value={result ? money(summary.expected_contribution_eur) : "Not calculated"}
                detail={result
                  ? result.horizon?.policy !== "minimum_reserve"
                    ? `Terminal energy ${money(result.horizon?.terminal_energy_value_eur)} · total decision value ${money(summary.total_decision_value_eur)}`
                    : "Sales − purchases − degradation − transaction fees"
                  : "Run the optimization to calculate"}
                stale={dirty && Boolean(result)}
              />
              <Kpi
                label="Battery Usage"
                value={result ? `${num(summary.throughput_mwh)} MWh` : "Not calculated"}
                detail={result
                  ? `${num(summary.equivalent_cycles, 2)} / ${num(resultBattery.max_equivalent_cycles, 2)} EFC · ${num(cyclePct, 0)}% used`
                  : `Cycle budget: ${num(resultBattery.max_equivalent_cycles, 2)} EFC`}
                stale={dirty && Boolean(result)}
              />
              <Kpi
                label="Observed SoC Range"
                value={result ? `${num(summary.min_soc_mwh, 0)}–${num(summary.max_soc_mwh, 0)} MWh` : "Not calculated"}
                detail={result
                  ? `Ends at ${num(result.proposal?.proposal_terminal_soc_mwh ?? result.optimization.terminal_soc_mwh, 0)} MWh · reserve ${resultBattery.target_soc_mwh} MWh`
                  : `Configured envelope: ${resultBattery.min_soc_mwh}–${resultBattery.max_soc_mwh} MWh`}
                stale={dirty && Boolean(result)}
              />
              <Kpi
                label="Order Proposal"
                value={result ? `${String(summary.order_count ?? 0)} ${summary.order_count === 1 ? "order" : "orders"}` : "Not generated"}
                detail={
                  result
                    ? `${result.dispatch.length} × ${result.market.product_minutes}-min intervals · ${
                        result.approval_status
                          ? "approved for demo export"
                          : result.validation.status === "passed"
                            ? "validated draft"
                            : "requires attention"
                      }`
                    : "Pending optimization"
                }
                stale={dirty && Boolean(result)}
              />
            </section>
            {dirty && result && (
              <div className="status-message warning stale-results" role="status" aria-live="polite">
                <AlertTriangle size={17} aria-hidden="true" />
                <div><strong>{draftChanges.length || "Configuration"} {draftChanges.length === 1 ? "change" : "changes"} since this run.</strong> Summary cards and charts show the previous completed result. {draftChanges.slice(0, 3).join(" · ")}{draftChanges.length > 3 ? ` · +${draftChanges.length - 3} more` : ""}</div>
              </div>
            )}
            {message && (
              <div
                ref={errorRef}
                tabIndex={message.kind === "error" ? -1 : undefined}
                className={"status-message " + message.kind}
                role={message.kind === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {message.kind === "error" ? (
                  <AlertTriangle size={17} />
                ) : (
                  <CheckCircle2 size={17} />
                )}{" "}
                {message.text}
              </div>
            )}
            {result?.order_generation && !dirty && (
              <div className="status-message info executable-status" role="status" aria-live="polite">
                <ShieldCheck size={17} aria-hidden="true" />
                <div>
                  <strong>Order proposal is executable</strong>
                  <span>Optimizer volumes were converted to valid market increments, then the complete order schedule was physically reconstructed and repaired before display. Estimated rounding impact: {signedMoney(result.order_generation.contribution_delta_eur)}.</span>
                  <details className="inline-evidence">
                    <summary>View order-generation details</summary>
                    <dl>
                      <div><dt>Volume increment</dt><dd>{result.order_generation.volume_increment_mw} MW</dd></div>
                      <div><dt>Adjusted quantities</dt><dd>{result.order_generation.adjusted_order_count}</dd></div>
                      <div><dt>Repair steps</dt><dd>{result.order_generation.repaired_order_count}</dd></div>
                      <div><dt>Volume reduction</dt><dd>{num(result.order_generation.volume_reduction_mwh)} MWh</dd></div>
                    </dl>
                  </details>
                </div>
              </div>
            )}
            {dst && (
              <div className="status-message warning">
                <AlertTriangle size={17} />
                DST delivery day: {result?.dispatch.length} unambiguous UTC
                intervals are shown.
              </div>
            )}
            <nav
              className="tabs"
              role="tablist"
              aria-label="Optimization results"
            >
              {tabs.map(([key, label], i) => (
                <button
                  key={key}
                  id={"tab-" + key}
                  role="tab"
                  aria-label={label}
                  aria-selected={tab === key}
                  aria-controls={"panel-" + key}
                  tabIndex={tab === key ? 0 : -1}
                  className={tab === key ? "active" : ""}
                  onClick={() => chooseTab(key)}
                  onKeyDown={(e) => tabKey(e, i)}
                >
                  <span className="tab-full">{label}</span>
                  <span className="tab-compact" aria-hidden="true">{compactTabLabels[key]}</span>
                </button>
              ))}
            </nav>
            <section
              id={"panel-" + tab}
              role="tabpanel"
              aria-labelledby={"tab-" + tab}
              className="panel result-panel"
            >
              {tab === "schedule" && (
                  <Schedule result={result} busy={busy} />
              )}{" "}
              {tab === "orders" && (
                <Orders
                  result={result}
                  busy={busy}
                  selected={selected}
                  choose={chooseOrder}
                  close={() => setSelected(undefined)}
                  volume={volume}
                  price={price}
                  comment={comment}
                  exclude={exclude}
                  setVolume={setVolume}
                  setPrice={setPrice}
                  setComment={setComment}
                  setExclude={setExclude}
                  edit={edit}
                  approve={approve}
                  exportProposal={exportProposal}
                />
              )}{" "}
              {tab === "proof" && (
                <ProofView result={result} battery={resultBattery} />
              )}{" "}
              {tab === "compare" && (
                <><Head n="05" title="Compare Saved Simulation Runs" text="Select completed runs, inspect their exact inputs and compare results across market outcomes." /><SavedRunComparison key={result?.simulation_id ?? "empty"} /></>
              )}
            </section>
          </div>
        </section>
      </main>
      <footer>
        <span>
          Illustrative data · run{" "}
          <span translate="no">{result?.simulation_id ?? "not started"}</span>
        </span>
        <span>
          * Confirm exchange rules, timing, increments and order types with IWB.
        </span>
      </footer>
    </>
  );
}

function Head({
  n,
  title,
  text,
  aside,
  action,
}: {
  n: string;
  title: string;
  text: string;
  aside?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <span>{n}</span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
      {action ?? <small>{aside}</small>}
    </div>
  );
}
function Schedule({
  result,
  busy,
}: {
  result?: Simulation;
  busy: boolean;
}) {
  return (
    <>
      <Head
        n="02"
        title="Optimize Dispatch"
        text="Price opportunity, battery response and state of charge across the delivery day."
        aside="Charge − · Discharge +"
      />
      {busy ? (
        <Empty
          icon={<LoaderCircle className="spinner" />}
          title="Optimizing delivery intervals…"
          text="Applying efficiency, SoC, power, availability and cycle constraints."
        />
      ) : result ? (
        <>
          {result.audit.modified_by_trader && <div className="status-message info" role="status">Showing trader proposal revision {result.proposal_revision ?? 2}; dispatch and SoC reflect the revised orders.</div>}
          <DispatchChart rows={result.proposal?.implied_dispatch ?? result.dispatch} battery={result.battery} forecast={result.forecast} />
          <EconomicsPanel result={result} />
          <ValueDrivers result={result} />
          <IntervalResultsTable result={result} />
        </>
      ) : (
        <Empty
          title="No result yet"
          text="Configure the case and run the optimization."
        />
      )}
    </>
  );
}
function ValueDrivers({ result }: { result: Simulation }) {
  const items = result.sensitivities ?? [];
  if (!items.length) return null;
  return <section className="value-drivers" aria-labelledby="value-drivers-title"><div className="value-drivers-head"><div><span className="eyebrow">DECISION SUPPORT</span><h3 id="value-drivers-title">What Could Change Value?</h3><p>Local sensitivities use the same saved forecast and assumptions.</p></div></div><div className="value-driver-list">{items.slice(0, 5).map((item) => <div className="value-driver" key={item.key}><div><strong>{item.label}</strong><small>{num(item.baseline_value)} → {num(item.tested_value)} {item.unit}</small></div><div className="value-driver-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(4, Math.abs(item.contribution_delta_eur) / Math.max(...items.map(x => Math.abs(x.contribution_delta_eur)), 1) * 100))}%` }} /></div><b className={item.contribution_delta_eur >= 0 ? "positive" : "negative"}>{signedMoney(item.contribution_delta_eur)}</b></div>)}</div><small>Directional estimate, not a guarantee. Re-run with the tested value before making a decision.</small></section>;
}
type OP = {
  result?: Simulation;
  busy: boolean;
  selected?: Order;
  choose: (o: Order) => void;
  close: () => void;
  volume: string;
  price: string;
  comment: string;
  exclude: boolean;
  setVolume: (v: string) => void;
  setPrice: (v: string) => void;
  setComment: (v: string) => void;
  setExclude: (v: boolean) => void;
  edit: () => void;
  approve: () => void;
  exportProposal: () => void;
};
function Orders(p: OP) {
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (p.selected) editorRef.current?.scrollIntoView({ block: "nearest" });
  }, [p.selected]);
  const issue = traderEditIssue(p);
  const volumeChanged = Boolean(p.selected) && Number(p.volume) !== p.selected?.volume_mw;
  const priceChanged = Boolean(p.selected) && Number(p.price) !== p.selected?.limit_price_eur_mwh;
  const impact = p.selected
    ? p.exclude
      ? -p.selected.expected_contribution_eur
      : estimate(p.selected, p.volume) - p.selected.expected_contribution_eur
    : 0;
  return (
    <>
      <Head
        n="03"
        title="Generate Day-Ahead Orders"
        text="Select a row to apply a controlled trader intervention."
        aside="No live submission"
      />
      {p.result && (
        <OrderTimeline orders={p.result.orders} selectedId={p.selected?.order_id} onSelect={p.choose} />
      )}
      <OrderTable
        orders={p.result?.orders ?? []}
        market={p.result?.market ?? defaultMarket}
        selectedId={p.selected?.order_id}
        onSelect={p.choose}
      />
      {p.selected && (
        <aside ref={editorRef} className="edit-drawer" aria-labelledby="edit-title">
          <div className="drawer-head">
            <div>
              <span className={"side " + p.selected.side.toLowerCase()}>
                {p.selected.side}
              </span>
              <h3 id="edit-title">
                Edit {orderTime(p.selected.delivery_local)} Order
              </h3>
            </div>
            <button
              className="icon-button"
              aria-label="Close order editor"
              onClick={p.close}
            >
              <X size={18} />
            </button>
          </div>
          <div className="before-after">
            <span>
              <small>Optimizer Volume</small>
              <strong>{num(p.selected.volume_mw)} MW</strong>
            </span>
              <span>
                <small>Optimizer Limit</small>
                <strong>{perMwh(p.selected.limit_price_eur_mwh)}</strong>
              </span>
              <span>
                <small>Break-Even Price</small>
                <strong>{perMwh(p.selected.break_even_price_eur_mwh)}</strong>
                <em>{p.selected.margin_to_break_even_eur_mwh >= 0 ? "+" : ""}{num(p.selected.margin_to_break_even_eur_mwh)} €/MWh margin</em>
              </span>
            <span>
              <small>Expected Contribution Change</small>
              <strong className={impact >= 0 ? "positive" : "negative"}>
                {signedMoney(impact)}
              </strong>
              {priceChanged && !volumeChanged && !p.exclude && <em>Limit price only; forecast value unchanged</em>}
            </span>
          </div>
          <div className="edit-fields">
            <TextNumber
              id="trade-volume"
              label="Trader volume"
              unit="MW"
              value={p.volume}
              step=".1"
              min="0.1"
              max={String(p.selected.side === "BUY"
                ? Math.min(p.result?.battery.max_charge_power_mw ?? 0, p.result?.battery.grid_limit_mw ?? 0)
                : Math.min(p.result?.battery.max_discharge_power_mw ?? 0, p.result?.battery.grid_limit_mw ?? 0))}
              disabled={p.exclude}
              change={p.setVolume}
            />
            <TextNumber
              id="trade-price"
              label="Trader limit price"
              unit="€/MWh"
              value={p.price}
              step=".01"
              min={String(p.result?.market.min_price_eur_mwh ?? -500)}
              max={String(p.result?.market.max_price_eur_mwh ?? 4000)}
              disabled={p.exclude}
              change={p.setPrice}
            />
            <label className="reason" htmlFor="reason">
              Decision rationale
              <input
                id="reason"
                name="reason"
                autoComplete="off"
                placeholder="Explain why this order should change…"
                value={p.comment}
                onChange={(e) => p.setComment(e.target.value)}
              />
              <small>Required for audit trail · at least 3 characters</small>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={p.exclude}
                onChange={(e) => p.setExclude(e.target.checked)}
              />
              Exclude this order
            </label>
          </div>
          <div className="pricing-evidence">
            <strong>Pricing evidence</strong>
            <span>Forecast {perMwh(p.selected.expected_price_eur_mwh)} · recommended {perMwh(p.selected.limit_price_eur_mwh)} · break-even {perMwh(p.selected.break_even_price_eur_mwh)}</span>
            <small>Contribution assumes execution at the forecast price. Clearing probability is not modeled.</small>
          </div>
          <p className={`edit-guidance${issue ? " invalid" : ""}`} role="status">
            {issue ?? "The backend will reconstruct SoC, throughput and contribution before accepting the revised proposal."}
          </p>
          <button
            className="secondary drawer-action"
            disabled={Boolean(issue) || p.busy}
            onClick={p.edit}
          >
            {p.busy ? "Revalidating…" : "Apply Change & Revalidate"}
          </button>
        </aside>
      )}
      <div className="approval-bar">
        <div>
          <strong>
            {p.result?.approval_status
              ? "Approved for demo export"
              : p.result?.validation.status === "passed" && p.result.orders.length === 0
                ? "No orders recommended"
              : p.result?.validation.status === "passed"
                ? "Ready for trader approval"
                : "Approval blocked"}
          </strong>
          <span>
            {p.result?.approval_status
              ? "The validated proposal can now be exported as CSV; no market submission occurs."
              : p.result?.validation.status === "passed" && p.result.orders.length === 0
                ? "Remaining idle maximizes expected contribution under the configured assumptions."
              : p.result?.validation.status === "passed"
                ? "Physical and market validation passed."
                : "Resolve validation findings before export."}
          </span>
        </div>
        <div className="actions">
          <button
            className="secondary"
            disabled={!p.result || p.busy || p.result.validation.status !== "passed" || !p.result.approval_status}
            onClick={p.exportProposal}
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            className="primary compact"
            disabled={
              !p.result ||
              p.result.validation.status !== "passed" ||
              p.busy ||
              Boolean(p.result.approval_status)
            }
            onClick={p.approve}
          >
            <FileCheck2 size={16} />
            {p.result?.approval_status
              ? "Approved for Demo Export"
              : p.result?.orders.length === 0
                ? "Confirm No-Trade Decision"
              : "Approve for Demo Export"}
          </button>
        </div>
      </div>
    </>
  );
}
function ProofView({
  result,
  battery,
}: {
  result?: Simulation;
  battery: Battery;
}) {
  const [filter, setFilter] = useState<"All" | ValidationDisplayStatus>("All");
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const proposalDispatch = result?.proposal?.implied_dispatch ?? result?.dispatch ?? [],
    chargePower = Math.max(0, ...proposalDispatch.filter((x) => x.power_mw < 0).map((x) => Math.abs(x.power_mw))),
    dischargePower = Math.max(0, ...proposalDispatch.filter((x) => x.power_mw > 0).map((x) => x.power_mw)),
    proposalMinSoc = result?.proposal?.proposal_min_soc_mwh ?? result?.summary.min_soc_mwh ?? 0,
    proposalMaxSoc = result?.proposal?.proposal_max_soc_mwh ?? result?.summary.max_soc_mwh ?? 0,
    proposalCycles = result?.proposal?.proposal_equivalent_cycles ?? result?.summary.equivalent_cycles ?? 0,
    proposalTerminalSoc =
      result?.proposal?.proposal_terminal_soc_mwh ??
      result?.optimization.terminal_soc_mwh ??
      0,
    solverStatus = result?.optimization.solver_status ?? "unknown",
    rows = result ? physicalEvidenceRows(result, battery, proposalDispatch, {
      chargePower, dischargePower, proposalMinSoc, proposalMaxSoc, proposalCycles, proposalTerminalSoc,
    }) : [];
  const failedCount = rows.filter((row) => row.status === "Issue").length;
  const bindingCount = rows.filter((row) => row.status === "Fully used").length;
  const uncheckedCount = rows.filter((row) => row.status === "Not evaluated").length;
  const evaluatedCount = rows.length - uncheckedCount;
  const visibleRows = filter === "All" ? rows : rows.filter((row) => row.status === filter);
  const activeRow = rows.find((row) => row.label === selectedCheck);
  const validationSummary = result?.validation.status === "passed"
    ? `All ${evaluatedCount} configured checks passed${bindingCount ? `; ${bindingCount} ${bindingCount === 1 ? "limit was" : "limits were"} reached` : ""}. No limits were exceeded.`
    : failedCount
      ? `${failedCount} physical ${failedCount === 1 ? "limit is" : "limits are"} exceeded.`
      : "Physical limits pass; review the order and market findings below.";
  return (
    <>
      <Head
        n="04"
        title="Physical Validation"
        text="Confirm that the proposed orders can be executed within the battery limits."
      />
      {!result ? (
        <Empty
          title="No validation evidence yet"
          text="Run the optimization to produce a feasibility proof."
        />
      ) : (
        <>
          <div className={`validation-summary ${result.validation.status}`} role="status">
            {result.validation.status === "passed" ? <CheckCircle2 size={26} aria-hidden="true" /> : <AlertTriangle size={26} aria-hidden="true" />}
            <div>
              <strong>{result.validation.status === "passed" ? "Physically Feasible" : result.validation.status === "warning" ? "Feasible with Warnings" : "Not Physically Feasible"}</strong>
              <span>{validationSummary}</span>
            </div>
            <small><strong>Fully used</strong> means a boundary was reached, not violated.</small>
          </div>
          {result.validation.findings.length > 0 && <ul className="checks">{result.validation.findings.map((finding) => <li key={`${finding.code}-${finding.interval ?? "run"}`}><AlertTriangle size={15} aria-hidden="true" />{finding.message}</li>)}</ul>}
          <section className="constraint-map" aria-labelledby="constraint-map-title">
            <div className="constraint-map-head">
              <div><span className="eyebrow">Execution evidence</span><h3 id="constraint-map-title">Constraint Headroom</h3><p>Observed use against each configured boundary. Select a check for its calculation evidence.</p></div>
              <div className="constraint-counts" aria-label="Validation totals"><strong>{evaluatedCount}/{evaluatedCount}</strong><span>checked</span><strong>{bindingCount}</strong><span>fully used</span><strong>{uncheckedCount}</strong><span>not evaluated</span></div>
            </div>
            <div className="constraint-filters" aria-label="Filter validation checks">
              {(["All", "Issue", "Fully used", "Headroom", "Verified", "Not evaluated"] as const).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}<span>{value === "All" ? rows.length : rows.filter((row) => row.status === value).length}</span></button>)}
            </div>
            {visibleRows.length === 0 ? <div className="constraint-empty">No checks match this filter.</div> : ["Battery & Grid", "Schedule Integrity", "Order Executability"].map((category) => {
              const categoryRows = visibleRows.filter((row) => row.category === category);
              return categoryRows.length ? <div className="constraint-group" key={category}>
                <h4>{category}</h4>
                <div className="constraint-list">{categoryRows.map((row) => <button type="button" className={`constraint-row ${row.status.toLowerCase().replaceAll(" ", "-")} ${selectedCheck === row.label ? "selected" : ""}`} key={row.label} onClick={() => setSelectedCheck(selectedCheck === row.label ? null : row.label)} aria-expanded={selectedCheck === row.label}>
                  <span className="constraint-name"><strong>{row.label}</strong><small>{row.observed} / {row.limit}</small></span>
                  <span className="constraint-track" aria-hidden="true"><span style={{ width: `${row.utilization}%` }} /><i /></span>
                  <span className="constraint-margin"><strong>{row.headroom}</strong><small>{row.status === "Verified" ? "validation result" : "remaining margin"}</small></span>
                  <span className={`validation-state ${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status === "Issue" ? <AlertTriangle size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}{row.status}</span>
                </button>)}</div>
              </div> : null;
            })}
            {activeRow && <aside className="constraint-evidence" aria-live="polite"><div><span>Selected check</span><strong>{activeRow.label}</strong></div><dl><div><dt>Evidence</dt><dd>{activeRow.evidence}</dd></div><div><dt>Calculation</dt><dd>{activeRow.formula}</dd></div><div><dt>Validation stage</dt><dd>{activeRow.stage}</dd></div></dl></aside>}
          </section>
          <details className="exact-validation">
            <summary>View Exact Validation Values</summary>
            <div className="table-scroll validation-table"><table>
              <caption className="sr-only">Exact validation values for the proposed battery schedule</caption>
              <thead><tr><th scope="col">Check</th><th scope="col">Observed / allowed</th><th scope="col">Margin</th><th scope="col">Status</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.observed} / {row.limit}</td><td>{row.headroom}</td><td>{row.status}</td></tr>)}</tbody>
            </table></div>
          </details>
          <details className="solver-details">
            <summary><span>Solver & Model Details</span><small>Technical evidence</small></summary>
            <div className="solver-explainer">
              <div className="solver-outcome">
                <CheckCircle2 size={22} aria-hidden="true" />
                <div><span>Solver result</span><strong>{solverStatus === "optimal" ? "Optimal solution found" : title(solverStatus)}</strong><small>{solverStatus === "optimal" ? "The model found the highest-value feasible schedule under the configured assumptions." : "Review this technical status before using the proposal."}</small></div>
              </div>
              <dl className="solver-metrics">
                <div><dt>Optimization goal</dt><dd>Maximize expected net contribution<small>Sales revenue minus charging purchases, degradation and transaction fees.</small></dd></div>
                <div><dt>Method</dt><dd>Mixed-integer linear optimization<small>HiGHS selects charge, discharge or idle for every delivery interval.</small><code translate="no">{result.optimization.engine}</code></dd></div>
                <div><dt>Calculation time</dt><dd>{num(result.optimization.solve_time_ms, 2)} ms<small>Backend solver runtime for this completed simulation.</small></dd></div>
              </dl>
            </div>
            <div className="model-safeguards">
              <div><h4>Safeguards enforced by the model</h4><p>Every item below was included in the optimization—not checked only after calculation.</p></div>
              <ul>
              {result.optimization.constraints.map((x) => (
                <li key={x}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span><strong>{constraintExplanation(x).title}</strong><small>{constraintExplanation(x).text}</small></span>
                </li>
              ))}
              </ul>
            </div>
          </details>
        </>
      )}
    </>
  );
}
function NF({
  id,
  label,
  hint,
  value,
  unit,
  step = "1",
  min,
  max,
  assumption = false,
  badge,
  disabled = false,
  change,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  unit: string;
  step?: string;
  min?: number;
  max?: number;
  assumption?: boolean;
  badge?: string;
  disabled?: boolean;
  change: (v: number) => void;
}) {
  return (
    <label htmlFor={id}>
      <span className="field-label">
        {label}
        {(assumption || badge) && <span className="assumption">{badge ?? "task input"}</span>}
      </span>
      <div className="number">
        <input
          id={id}
          name={id}
          autoComplete="off"
          inputMode="decimal"
          type="number"
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(e) => change(Number(e.target.value))}
        />
        <span>{unit}</span>
      </div>
      <small className={!hint ? "empty-hint" : undefined}>
        {hint ?? "No additional assumption"}
      </small>
    </label>
  );
}

type ScenarioProbabilities = { downside: number; expected: number; upside: number };

function ScenarioProbabilityEditor({ value, onChange }: { value: ScenarioProbabilities; onChange: (value: ScenarioProbabilities) => void }) {
  const total = value.downside + value.expected + value.upside;
  const valid = Object.values(value).every((probability) => Number.isFinite(probability) && probability >= 0 && probability <= 100)
    && Math.abs(total - 100) < .001;
  const difference = Math.abs(100 - total);
  const scenarios: Array<{ key: keyof ScenarioProbabilities; label: string; description: string }> = [
    { key: "downside", label: "Downside", description: "Lower-price case" },
    { key: "expected", label: "Expected", description: "Central forecast" },
    { key: "upside", label: "Upside", description: "Higher-price case" },
  ];

  return (
    <fieldset id="scenario-probability-editor" className={`probability-editor ${valid ? "valid" : "invalid"}`}>
      <legend className="sr-only">Scenario probability allocation</legend>
      <div className="probability-editor-heading">
        <span>Probability allocation</span>
        <strong className={valid ? "valid" : "invalid"}>{num(total, 0)}%</strong>
      </div>
      <p>Weights used to score each feasible schedule across the three price cases.</p>
      <div className="probability-bar" role="img" aria-label={`Downside ${num(value.downside, 0)}%, expected ${num(value.expected, 0)}%, upside ${num(value.upside, 0)}%`}>
        {scenarios.map(({ key }) => value[key] > 0 && (
          <span key={key} className={`probability-segment ${key}`} style={{ flexGrow: value[key] }} />
        ))}
      </div>
      <div className="probability-rows">
        {scenarios.map(({ key, label, description }) => (
          <label key={key} htmlFor={`prob-${key}`}>
            <span className={`probability-key ${key}`} aria-hidden="true" />
            <span className="probability-copy"><strong>{label}</strong><small>{description}</small></span>
            <span className="probability-input">
              <input
                id={`prob-${key}`}
                name={`prob-${key}`}
                type="number"
                inputMode="decimal"
                autoComplete="off"
                min={0}
                max={100}
                step="1"
                value={value[key]}
                onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
                aria-describedby="scenario-probability-status"
              />
              <span>%</span>
            </span>
          </label>
        ))}
      </div>
      <div id="scenario-probability-status" className="probability-status" role="status" aria-live="polite">
        {valid ? (
          <><CheckCircle2 size={14} aria-hidden="true" /><span>100% allocated</span></>
        ) : (
          <><AlertTriangle size={14} aria-hidden="true" /><span>{total > 100 ? `Reduce by ${num(difference, 0)} percentage points.` : `Allocate ${num(difference, 0)} more percentage points.`}</span></>
        )}
      </div>
    </fieldset>
  );
}
function TextNumber({
  id,
  label,
  unit,
  value,
  step,
  min,
  max,
  disabled = false,
  change,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  step: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  change: (v: string) => void;
}) {
  return (
    <label htmlFor={id}>
      {label}
      <div className="number">
        <input
          id={id}
          name={id}
          autoComplete="off"
          inputMode="decimal"
          type="number"
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon?: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="state-block">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
type ConstraintDirection = "minimum" | "maximum";

function constraintExplanation(value: string) {
  const explanations: Record<string, { title: string; text: string }> = {
    "SOC balance": { title: "Energy balance", text: "Tracks stored energy after every charge and discharge." },
    "SOC envelope": { title: "State-of-charge limits", text: "Keeps stored energy between the configured minimum and maximum." },
    "power and grid limits": { title: "Power & grid limits", text: "Respects charge, discharge and grid-connection capacity." },
    availability: { title: "Asset availability", text: "Prevents dispatch during unavailable delivery intervals." },
    "terminal SOC": { title: "End-of-day reserve", text: "Finishes with at least the required stored energy." },
    "throughput limit": { title: "Daily cycle budget", text: "Limits total charged and discharged energy for the day." },
    "binary charge/discharge exclusivity": { title: "Operating mode", text: "Prevents simultaneous charging and discharging." },
  };
  return explanations[value] ?? { title: title(value), text: "Included in the optimization model." };
}

type ValidationDisplayStatus = "Issue" | "Fully used" | "Headroom" | "Verified" | "Not evaluated";
type ValidationEvidenceRow = {
  category: "Battery & Grid" | "Schedule Integrity" | "Order Executability";
  label: string; observed: string; limit: string; headroom: string;
  utilization: number; status: ValidationDisplayStatus; evidence: string;
  formula: string; stage: string;
};

function physicalEvidenceRows(
  result: Simulation,
  battery: Battery,
  dispatch: Simulation["dispatch"],
  values: { chargePower: number; dischargePower: number; proposalMinSoc: number; proposalMaxSoc: number; proposalCycles: number; proposalTerminalSoc: number },
): ValidationEvidenceRow[] {
  const errors = new Set(result.validation.findings.filter((x) => x.severity === "error").map((x) => x.code));
  const dt = result.market.product_minutes / 60;
  const eta = Math.sqrt(battery.round_trip_efficiency);
  let priorSoc = battery.initial_soc_mwh;
  let maxBalanceError = 0;
  for (const row of dispatch) {
    const expectedDelta = row.power_mw < 0 ? Math.abs(row.power_mw) * dt * eta : row.power_mw > 0 ? -row.power_mw * dt / eta : 0;
    maxBalanceError = Math.max(maxBalanceError, Math.abs(row.soc_mwh - priorSoc - expectedDelta));
    priorSoc = row.soc_mwh;
  }
  const expectedIntervals = 24 * 60 / result.market.product_minutes;
  const unavailableDispatch = dispatch.filter((x) => battery.unavailable_intervals.includes(x.interval) && x.action !== "idle").length;
  const modeConflicts = dispatch.filter((x) => (x.action === "idle" && Math.abs(x.power_mw) > 0.001) || (x.action === "charge" && x.power_mw >= -0.001) || (x.action === "discharge" && x.power_mw <= 0.001)).length;
  const orderCodes = new Set(["duplicate_order", "price_range", "duration", "unknown_interval", "multiple_orders_interval", "order_power_limit", "energy_mismatch", "volume_increment", "price_increment", "order_unavailable", "proposal_soc_below_min", "proposal_soc_above_max", "proposal_terminal_soc", "proposal_cycle_limit"]);
  const orderIssues = result.validation.findings.filter((x) => orderCodes.has(x.code)).length;
  const make = (
    category: ValidationEvidenceRow["category"], label: string, observed: number, allowed: number,
    unit: string, direction: ConstraintDirection, evidence: string, formula: string, stage: string,
    errorCodes: string[] = [], digits = 1,
  ): ValidationEvidenceRow => {
    const margin = direction === "maximum" ? allowed - observed : observed - allowed;
    const tolerance = unit === "EFC" ? 0.005 : unit === "MWh" ? 0.15 : 0.05;
    const issue = errorCodes.some((code) => errors.has(code)) || margin < -tolerance;
    const status: ValidationDisplayStatus = issue ? "Issue" : Math.abs(margin) <= tolerance ? "Fully used" : "Headroom";
    const utilization = direction === "maximum" ? observed / Math.max(allowed, 1e-9) : allowed / Math.max(observed, allowed, 1e-9);
    return { category, label, observed: `${num(observed, digits)} ${unit}`, limit: `${num(allowed, digits)} ${unit}`, headroom: issue ? `${num(Math.abs(margin), digits)} ${unit} outside` : `${num(Math.max(0, margin), digits)} ${unit}`, utilization: Math.min(100, Math.max(0, utilization * 100)), status, evidence, formula, stage };
  };
  const rows: ValidationEvidenceRow[] = [
    make("Battery & Grid", "Charge power", values.chargePower, Math.min(battery.max_charge_power_mw, battery.grid_limit_mw), "MW", "maximum", "Highest charging instruction in the executable order schedule.", "max(abs(charge MW)) ≤ min(charge limit, grid limit)", "Optimizer + post-order reconstruction", ["charge_power_limit", "order_power_limit"]),
    make("Battery & Grid", "Discharge power", values.dischargePower, Math.min(battery.max_discharge_power_mw, battery.grid_limit_mw), "MW", "maximum", "Highest discharging instruction in the executable order schedule.", "max(discharge MW) ≤ min(discharge limit, grid limit)", "Optimizer + post-order reconstruction", ["discharge_power_limit", "order_power_limit"]),
    make("Battery & Grid", "Grid connection", Math.max(values.chargePower, values.dischargePower), battery.grid_limit_mw, "MW", "maximum", "Highest import or export power at the configured connection point.", "max(abs(grid MW)) ≤ connection limit", "Optimizer + backend validation", ["grid_limit"]),
    make("Battery & Grid", "Minimum state of charge", values.proposalMinSoc, battery.min_soc_mwh, "MWh", "minimum", "Lowest stored energy reached by the executable orders.", "min(interval SoC) ≥ minimum SoC", "Post-order physical reconstruction", ["soc_below_min", "proposal_soc_below_min"]),
    make("Battery & Grid", "Maximum state of charge", values.proposalMaxSoc, battery.max_soc_mwh, "MWh", "maximum", "Highest stored energy reached by the executable orders.", "max(interval SoC) ≤ maximum SoC", "Post-order physical reconstruction", ["soc_above_max", "proposal_soc_above_max"]),
    make("Battery & Grid", "Daily cycle budget", values.proposalCycles, battery.max_equivalent_cycles, "EFC", "maximum", "Charged and discharged battery energy expressed as equivalent full cycles.", "throughput ÷ (2 × capacity) ≤ cycle budget", "Optimizer + backend validation", ["cycle_limit", "proposal_cycle_limit"], 2),
    make("Battery & Grid", "End-of-day reserve", values.proposalTerminalSoc, battery.target_soc_mwh, "MWh", "minimum", "Stored energy after the final delivery interval.", "terminal SoC ≥ configured reserve", "Optimizer + post-order reconstruction", ["terminal_soc", "proposal_terminal_soc"]),
    { category: "Battery & Grid", label: "Ramp rate", observed: "Not configured", limit: "Not configured", headroom: "—", utilization: 0, status: "Not evaluated", evidence: "No asset ramp-rate assumption is configured for this prototype.", formula: "abs(power[t] − power[t−1]) ≤ ramp limit × elapsed time", stage: "Not modeled" },
    make("Schedule Integrity", "Energy balance", maxBalanceError, 0.15, "MWh", "maximum", "Largest interval reconciliation difference after applying duration and efficiency.", "SoC[t] = SoC[t−1] + charge × η × Δt − discharge ÷ η × Δt", "Independent backend validation", ["energy_balance"], 2),
    { category: "Schedule Integrity", label: "Asset availability", observed: `${unavailableDispatch} active intervals`, limit: `${battery.unavailable_intervals.length} unavailable intervals tested`, headroom: unavailableDispatch ? `${unavailableDispatch} conflicts` : "All clear", utilization: unavailableDispatch ? 100 : 0, status: errors.has("unavailable") || errors.has("order_unavailable") ? "Issue" : "Verified", evidence: `${battery.unavailable_intervals.length} configured unavailable intervals were checked against the executable schedule.`, formula: "active dispatch in unavailable intervals = 0", stage: "Optimizer + backend validation" },
    make("Schedule Integrity", "Operating mode", modeConflicts, 0, "conflicts", "maximum", "Action labels and signed power agree for every interval.", "one of charge, discharge or idle per interval", "Binary optimizer constraint + backend validation", ["operating_mode"], 0),
    make("Schedule Integrity", "Interval coverage", dispatch.length, expectedIntervals, "intervals", "minimum", `The ${result.market.product_minutes}-minute product requires ${expectedIntervals} delivery intervals for a normal day.`, "returned intervals ≥ expected delivery intervals", "API result integrity check", ["empty_schedule"], 0),
    make("Order Executability", "Order reconciliation", orderIssues, 0, "issues", "maximum", `${result.orders.length} generated orders were reconstructed into the physical schedule.`, "market-valid orders + reconstructed SoC and throughput must remain feasible", "Post-rounding and post-trader-edit validation", [...orderCodes], 0),
  ];
  for (const row of rows) {
    if ((row.category === "Schedule Integrity" || row.category === "Order Executability") && row.status !== "Issue") row.status = "Verified";
  }
  return rows;
}

const num = (v?: number, d = 1) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-CH", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(v)
    : "–";
const money = (v?: number) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(v)
    : "–";
const signedMoney = (v?: number) =>
  typeof v !== "number" || Math.abs(v) < 0.005
    ? "–"
    : (v > 0 ? "+ " : "− ") + money(Math.abs(v));
const perMwh = (v: number) => money(v) + "/MWh";
const title = (v: string) =>
  v.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
function formatDate(v: string) {
  const d = new Date(v + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
function orderTime(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat("en-CH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Zurich",
        timeZoneName: "short",
      }).format(d);
}
function estimate(o: Order, v: string) {
  const n = Number(v);
  return Number.isFinite(n) && o.volume_mw
    ? (o.expected_contribution_eur * n) / o.volume_mw
    : o.expected_contribution_eur;
}
function traderEditIssue(p: OP) {
  if (!p.selected || !p.result) return "Select an order to edit.";
  if (p.comment.trim().length < 3) return "Add a decision rationale of at least 3 characters.";
  if (p.exclude) return null;
  const volume = Number(p.volume);
  const price = Number(p.price);
  if (!p.volume.trim() || !Number.isFinite(volume) || volume <= 0) return "Enter a positive trader volume.";
  const powerLimit = p.selected.side === "BUY"
    ? Math.min(p.result.battery.max_charge_power_mw, p.result.battery.grid_limit_mw)
    : Math.min(p.result.battery.max_discharge_power_mw, p.result.battery.grid_limit_mw);
  if (volume > powerLimit + 1e-6) return `Volume cannot exceed the ${num(powerLimit)} MW physical limit.`;
  if (!isIncrement(volume, p.result.market.volume_increment_mw)) return `Volume must use ${p.result.market.volume_increment_mw} MW increments.`;
  if (!p.price.trim() || !Number.isFinite(price)) return "Enter a valid trader limit price.";
  if (price < p.result.market.min_price_eur_mwh || price > p.result.market.max_price_eur_mwh) return `Limit price must be between ${perMwh(p.result.market.min_price_eur_mwh)} and ${perMwh(p.result.market.max_price_eur_mwh)}.`;
  if (!isIncrement(price, p.result.market.price_increment_eur_mwh)) return `Limit price must use ${p.result.market.price_increment_eur_mwh} €/MWh increments.`;
  if (Math.abs(volume - p.selected.volume_mw) < 1e-9 && Math.abs(price - p.selected.limit_price_eur_mwh) < 1e-9) return "Change the volume or limit price, or exclude the order.";
  return null;
}
function isIncrement(value: number, increment: number) {
  return Math.abs(value / increment - Math.round(value / increment)) < 1e-6;
}
function scenarioDescription(v: string) {
  return v === "Downside"
    ? "Illustrative Day-Ahead forecast with a €15/MWh peak reduction."
    : v === "Peak compression"
      ? "Illustrative Day-Ahead peaks reduced by €25/MWh to test spread risk."
      : v === "Upside"
        ? "Illustrative price case with an 8% uplift across the delivery day."
        : "Illustrative central Day-Ahead price forecast.";
}
function validate(b: Battery, m: Market, d: string, u: string, probabilities: { downside: number; expected: number; upside: number }) {
  if (!d) return "Choose a delivery date.";
  if (!Number.isFinite(b.capacity_mwh) || b.capacity_mwh <= 0)
    return "Energy capacity must be greater than 0 MWh.";
  if (
    !Number.isFinite(b.max_charge_power_mw) ||
    b.max_charge_power_mw <= 0 ||
    !Number.isFinite(b.max_discharge_power_mw) ||
    b.max_discharge_power_mw <= 0 ||
    !Number.isFinite(b.grid_limit_mw) ||
    b.grid_limit_mw <= 0
  )
    return "Charge, discharge and grid limits must all be greater than 0 MW.";
  if (
    b.min_soc_mwh < 0 ||
    b.max_soc_mwh > b.capacity_mwh ||
    b.min_soc_mwh >= b.max_soc_mwh
  )
    return `Set the SoC envelope between 0 and ${num(b.capacity_mwh, 0)} MWh, with minimum below maximum.`;
  if (b.initial_soc_mwh < b.min_soc_mwh || b.initial_soc_mwh > b.max_soc_mwh)
    return "Initial SoC must remain inside the configured envelope.";
  if (b.target_soc_mwh < b.min_soc_mwh || b.target_soc_mwh > b.max_soc_mwh)
    return "Minimum end-of-day SoC must remain inside the configured envelope.";
  if (b.round_trip_efficiency <= 0 || b.round_trip_efficiency > 1)
    return "Round-trip efficiency must be greater than 0% and no more than 100%.";
  if (b.degradation_cost_eur_per_mwh < 0)
    return "Degradation cost cannot be negative.";
  if (b.max_equivalent_cycles <= 0)
    return "Daily cycle budget must be greater than 0 EFC.";
  const probabilityValues = Object.values(probabilities);
  if (probabilityValues.some((value) => !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(probabilityValues.reduce((sum, value) => sum + value, 0) - 100) > .001)
    return "Downside, expected and upside probabilities must each be between 0% and 100% and total 100%.";
  try {
    parseIntervals(u, m.product_minutes);
  } catch (e) {
    return e instanceof Error ? e.message : "Check unavailable intervals.";
  }
  return "";
}
function parseIntervals(v: string, productMinutes: 15 | 60) {
  if (!v.trim()) return [];
  const windows = v.split(",").map((x) => x.trim());
  if (windows.some((x) => !x)) throw new Error("Remove empty availability-window entries.");
  const step = productMinutes;
  const indexes: number[] = [];
  for (const window of windows) {
    const match = window.match(/^(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})$/);
    if (!match) throw new Error("Use local-time windows such as 06:00–08:00.");
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (start < 0 || end > 1440 || start >= end || start % step || end % step)
      throw new Error(`Availability windows must align to ${productMinutes}-minute products and remain within one delivery day.`);
    for (let minute = start; minute < end; minute += step) indexes.push(minute / step);
  }
  return [...new Set(indexes)].sort((a, b) => a - b);
}
function intervalsToWindows(indexes: number[], productMinutes: 15 | 60) {
  if (!indexes.length) return "";
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  let start = sorted[0], previous = sorted[0];
  for (const index of sorted.slice(1)) {
    if (index === previous + 1) previous = index;
    else { ranges.push([start, previous + 1]); start = previous = index; }
  }
  ranges.push([start, previous + 1]);
  const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return ranges.map(([a, b]) => `${clock(a * productMinutes)}–${clock(b * productMinutes)}`).join(", ");
}
function configurationChanges(result: Simulation, battery: Battery, market: Market, scenario: string, risk: string, horizon: string, terminalValue: number, unavailable: string) {
  const changes: string[] = [];
  if (result.market.product_minutes !== market.product_minutes) changes.push(`Product ${result.market.product_minutes} → ${market.product_minutes} min`);
  if (result.scenario_name !== scenario) changes.push(`Forecast ${result.scenario_name} → ${scenario}`);
  if ((result.risk_posture ?? "balanced") !== risk) changes.push(`Policy ${title(result.risk_posture ?? "balanced")} → ${title(risk)}`);
  if ((result.horizon_policy ?? "minimum_reserve") !== horizon) changes.push(`Horizon ${title(result.horizon_policy ?? "minimum_reserve")} → ${title(horizon)}`);
  if (horizon === "terminal_value" && (result.terminal_value_eur_per_mwh ?? 0) !== terminalValue) changes.push(`Terminal value ${terminalValue} €/MWh`);
  if (result.market.exchange_fee_policy !== market.exchange_fee_policy || result.market.exchange_fee_eur_per_mwh !== market.exchange_fee_eur_per_mwh) changes.push(market.exchange_fee_policy === "configured" ? `Exchange fee ${market.exchange_fee_eur_per_mwh} €/MWh` : "Exchange fee excluded");
  const batteryKeys: Array<keyof Battery> = ["capacity_mwh", "max_charge_power_mw", "max_discharge_power_mw", "grid_limit_mw", "initial_soc_mwh", "min_soc_mwh", "max_soc_mwh", "target_soc_mwh", "round_trip_efficiency", "degradation_cost_eur_per_mwh", "max_equivalent_cycles"];
  if (batteryKeys.some((key) => result.battery[key] !== battery[key])) changes.push("Battery envelope changed");
  if (intervalsToWindows(result.battery.unavailable_intervals, result.market.product_minutes) !== unavailable) changes.push("Availability changed");
  return changes;
}
