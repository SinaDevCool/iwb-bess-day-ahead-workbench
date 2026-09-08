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
  ScenarioOutcomeChart,
} from "@/components/analytics-charts";
import { api, download } from "@/lib/api";
import type { Battery, Market, Order, Simulation } from "@/types/api";

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
  assumptions_unverified: true,
};
const tabs = [
  ["schedule", "Dispatch & Economics"],
  ["orders", "Auction Orders"],
  ["proof", "Physical Validation"],
  ["compare", "Scenario Comparison"],
] as const;
type TabKey = (typeof tabs)[number][0];

export default function Workbench() {
  const [battery, setBattery] = useState(defaultBattery),
    [market, setMarket] = useState(defaultMarket),
    [date, setDate] = useState("2026-09-09"),
    [scenario, setScenario] = useState("Expected forecast"),
    [strategy, setStrategy] = useState("expected_value"),
    [peak, setPeak] = useState(0),
    [availability, setAvailability] = useState("Fully available"),
    [unavailable, setUnavailable] = useState("");
  const [result, setResult] = useState<Simulation>(),
    [baseline, setBaseline] = useState<Simulation>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ kind: string; text: string } | null>(
      null,
    ),
    [dirty, setDirty] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [tab, setTab] = useState<TabKey>("schedule"),
    [selected, setSelected] = useState<Order>(),
    [volume, setVolume] = useState(""),
    [price, setPrice] = useState(""),
    [comment, setComment] = useState(""),
    [exclude, setExclude] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const run = async (first = false) => {
    const error = validate(battery, date, unavailable);
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
            unavailable_intervals: parseIntervals(unavailable),
          },
          market,
          strategy,
          peak_reduction_eur_mwh: peak,
        }),
      });
      setResult(next);
      if (first || !baseline) setBaseline(next);
      setDirty(false);
      setSelected(undefined);
      setMessage({
        kind: next.validation.status === "passed" ? "success" : "error",
        text:
          "Optimization complete: " +
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
        setBaseline(latest);
        setBattery(latest.battery);
        setMarket(latest.market);
        setDate(latest.delivery_date);
        setScenario(latest.scenario_name);
        setStrategy(latest.strategy ?? "expected_value");
        setPeak(latest.peak_reduction_eur_mwh ?? 0);
        setUnavailable(latest.battery.unavailable_intervals.join(", "));
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
      const requested = new URLSearchParams(location.search).get("tab");
      if (tabs.some(([key]) => key === requested)) setTab(requested as TabKey);
    };
    restoreTab();
    addEventListener("popstate", restoreTab);
    return () => removeEventListener("popstate", restoreTab);
  }, []);
  const change = () => {
    if (result) setDirty(true);
    setMessage(null);
  };
  const chooseTab = (key: TabKey) => {
    setTab(key);
    const url = new URL(location.href);
    url.searchParams.set("tab", key);
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
    setPeak(0);
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
    const m = market.product_minutes === 15 ? 4 : 1;
    const intervalRange = (startHour: number, endHour: number) =>
      Array.from({ length: (endHour - startHour) * m }, (_, index) => startHour * m + index).join(", ");
    setUnavailable(
      value === "Morning outage"
        ? intervalRange(6, 8)
        : value === "Evening peak outage"
          ? intervalRange(18, 20)
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
          body: JSON.stringify({
            adjustments: [
              {
                order_id: selected.order_id,
                volume_mw: volume ? Number(volume) : null,
                limit_price_eur_mwh: price ? Number(price) : null,
                exclude,
                comment,
              },
            ],
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
  const summary = result?.summary ?? {},
    resultBattery = result?.battery ?? battery,
    resultMarket = result?.market ?? market,
    cyclePct = Math.min(
      100,
      ((summary.equivalent_cycles ?? 0) / resultBattery.max_equivalent_cycles) * 100,
    ),
    delta =
      result && baseline
        ? result.summary.expected_contribution_eur -
          baseline.summary.expected_contribution_eur
        : undefined,
    dst =
      result &&
      result.dispatch.length !== (resultMarket.product_minutes === 60 ? 24 : 96);
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
        <section className="workspace">
          <aside className="panel inputs" aria-labelledby="input-title">
            <div className="panel-title">
              <div>
                <span>01</span>
                <h2 id="input-title">Configure Market &amp; Battery</h2>
              </div>
              <button
                className="icon-button"
                onClick={reset}
                aria-label="Reset all inputs"
                title="Reset case inputs"
              >
                <RotateCcw size={17} aria-hidden="true" />
              </button>
            </div>
            <fieldset>
              <legend>Delivery & Market</legend>
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
                    setAvailability("Fully available");
                    setUnavailable("");
                    change();
                  }}
                >
                  <option value="60">60 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
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
                    if (v === "Downside") {
                      setStrategy("conservative");
                      setPeak(15);
                      setAvailability("Fully available");
                      setUnavailable("");
                    } else if (v === "Availability stress") {
                      const multiplier = market.product_minutes === 15 ? 4 : 1;
                      setStrategy("expected_value");
                      setPeak(0);
                      setAvailability("Evening peak outage");
                      setUnavailable(Array.from({ length: 2 * multiplier }, (_, index) => 18 * multiplier + index).join(", "));
                    } else {
                      setStrategy("expected_value");
                      setPeak(v === "Peak compression" ? 25 : 0);
                      setAvailability("Fully available");
                      setUnavailable("");
                    }
                    change();
                  }}
                >
                  <option>Expected forecast</option>
                  <option>Downside</option>
                  <option>Peak compression</option>
                  <option>Availability stress</option>
                </select>
                <small>{scenarioDescription(scenario)}</small>
              </label>
            </fieldset>
            <fieldset>
              <legend>Battery Constraints</legend>
              <div className="assumption-note">
                <BatteryCharging size={16} aria-hidden="true" />
                <span>
                  <strong>Task baseline</strong>
                  100 MWh capacity · 50 MW charge/discharge · 2-hour duration
                </span>
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
            </fieldset>
            <fieldset>
              <legend>Asset Availability</legend>
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
                  Unavailable interval indices
                  <input
                    id="intervals"
                    name="intervals"
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="Example: 6, 18…"
                    value={unavailable}
                    onChange={(e) => {
                      setUnavailable(e.target.value);
                      setAvailability("Custom");
                      change();
                    }}
                  />
                  <small>Advanced model input. Indices start at 0.</small>
                </label>
              )}
            </fieldset>
            {dirty && result && (
              <div className="stale-note">
                <AlertTriangle size={15} aria-hidden="true" />
                Inputs changed. Results show the previous run.
              </div>
            )}
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
          </aside>
          <div className="main-column">
            <section className="kpis" aria-label="Optimization summary">
              <Kpi
                label="Expected Net Contribution"
                value={money(summary.expected_contribution_eur)}
                detail="Sales − purchases − degradation"
                tone={result ? "good" : ""}
              />
              <Kpi
                label="Daily Throughput"
                value={
                  num(summary.throughput_mwh) +
                  " / " +
                  num(
                    2 * resultBattery.capacity_mwh * resultBattery.max_equivalent_cycles,
                    0,
                  ) +
                  " MWh"
                }
                detail={
                  num(summary.equivalent_cycles, 2) +
                  " EFC · " +
                  num(cyclePct, 0) +
                  "% of budget"
                }
                progress={cyclePct}
              />
              <Kpi
                label="State of Charge"
                value={
                  num(summary.min_soc_mwh, 0) +
                  "–" +
                  num(summary.max_soc_mwh, 0) +
                  " MWh"
                }
                detail={
                  "Ends at " +
                  num(result?.proposal?.proposal_terminal_soc_mwh ?? result?.optimization.terminal_soc_mwh, 0) +
                  " MWh · target " +
                  resultBattery.target_soc_mwh
                }
              />
              <Kpi
                label="Order Proposal"
                value={
                  String(summary.order_count ?? 0) +
                  " " +
                  (summary.order_count === 1 ? "order" : "orders")
                }
                detail={
                  result?.approval_status
                    ? "Approved for demo export"
                    : result?.validation.status === "passed"
                      ? "Validated draft"
                      : result
                        ? "Requires attention"
                        : "Pending optimization"
                }
                tone={
                  result?.validation.status === "passed"
                    ? "good"
                    : result
                      ? "warn"
                      : ""
                }
              />
            </section>
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
                  aria-selected={tab === key}
                  aria-controls={"panel-" + key}
                  tabIndex={tab === key ? 0 : -1}
                  className={tab === key ? "active" : ""}
                  onClick={() => chooseTab(key)}
                  onKeyDown={(e) => tabKey(e, i)}
                >
                  {label}
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
                <Compare
                  result={result}
                  baseline={baseline}
                  delta={delta}
                  scenario={scenario}
                  setBase={() => {
                    if (result) {
                      setBaseline(result);
                      setMessage({
                        kind: "info",
                        text:
                          result.scenario_name +
                          " is now the comparison baseline.",
                      });
                    }
                  }}
                />
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
          <DispatchChart rows={result.proposal?.implied_dispatch ?? result.dispatch} battery={result.battery} />
          <EconomicsPanel result={result} />
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
  const hasEffectiveChange = Boolean(p.selected) && (p.exclude || Number(p.volume) !== p.selected?.volume_mw || Number(p.price) !== p.selected?.limit_price_eur_mwh);
  const impact = p.selected
    ? estimate(p.selected, p.volume) - p.selected.expected_contribution_eur
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
        <OrderTimeline orders={p.result.orders} />
      )}
      <OrderTable
        orders={p.result?.orders ?? []}
        market={p.result?.market ?? defaultMarket}
        selectedId={p.selected?.order_id}
        onSelect={p.choose}
      />
      {p.selected && (
        <aside className="edit-drawer" aria-labelledby="edit-title">
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
              <small>Estimated Impact</small>
              <strong className={impact >= 0 ? "positive" : "negative"}>
                {signedMoney(impact)}
              </strong>
            </span>
          </div>
          <div className="edit-fields">
            <TextNumber
              id="trade-volume"
              label="Trader volume"
              unit="MW"
              value={p.volume}
              step=".1"
              change={p.setVolume}
            />
            <TextNumber
              id="trade-price"
              label="Trader limit price"
              unit="€/MWh"
              value={p.price}
              step=".01"
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
          <button
            className="secondary drawer-action"
            disabled={p.comment.trim().length < 3 || p.busy || !hasEffectiveChange}
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
              : p.result?.validation.status === "passed"
                ? "Ready for trader approval"
                : "Approval blocked"}
          </strong>
          <span>
            {p.result?.approval_status
              ? "The validated proposal can now be exported as CSV; no market submission occurs."
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
    rows = result
      ? [
          constraintRow("Charge power", Math.min(battery.max_charge_power_mw, battery.grid_limit_mw), chargePower, "MW", "maximum"),
          constraintRow("Discharge power", Math.min(battery.max_discharge_power_mw, battery.grid_limit_mw), dischargePower, "MW", "maximum"),
          envelopeRow(battery.min_soc_mwh, battery.max_soc_mwh, proposalMinSoc, proposalMaxSoc),
          constraintRow("Cycle budget", battery.max_equivalent_cycles, proposalCycles, "EFC", "maximum", 2),
          constraintRow("End-of-day reserve", battery.target_soc_mwh, proposalTerminalSoc, "MWh", "minimum"),
        ]
      : [];
  const failedCount = rows.filter((row) => row.status === "Failed").length;
  const bindingCount = rows.filter((row) => row.status === "Binding").length;
  const validationSummary = result?.validation.status === "passed"
    ? `All ${rows.length} physical checks passed${bindingCount ? `; ${bindingCount} ${bindingCount === 1 ? "limit is" : "limits are"} fully utilized` : ""}.`
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
            <small><strong>Binding</strong> means a limit is fully used, not violated.</small>
          </div>
          {result.validation.findings.length > 0 && <ul className="checks">{result.validation.findings.map((finding) => <li key={`${finding.code}-${finding.interval ?? "run"}`}><AlertTriangle size={15} aria-hidden="true" />{finding.message}</li>)}</ul>}
          <div className="table-scroll validation-table">
            <table>
              <caption className="sr-only">Physical validation of the proposed battery schedule</caption>
              <thead><tr><th scope="col">Physical check</th><th scope="col">Observed / allowed</th><th scope="col">Remaining margin</th><th scope="col">Status</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.observed} / {row.limit}</td>
                  <td>{row.headroom}</td>
                  <td><span className={`validation-state ${row.status.toLowerCase()}`}>{row.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <details className="solver-details">
            <summary>Solver & Model Details</summary>
            <div className="proof-grid">
              <Proof label="Objective" value={result.optimization.objective} />
              <Proof label="Engine" value={result.optimization.engine} />
              <Proof
                label="Solver status"
                value={result.optimization.solver_status ?? "–"}
              />
              <Proof
                label="Solve time"
                value={num(result.optimization.solve_time_ms, 2) + " ms"}
              />
            </div>
            <ul className="checks">
              {result.optimization.constraints.map((x) => (
                <li key={x}>
                  <CheckCircle2 size={15} />
                  {title(x)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </>
  );
}
function Compare({
  result,
  baseline,
  delta,
  scenario,
  setBase,
}: {
  result?: Simulation;
  baseline?: Simulation;
  delta?: number;
  scenario: string;
  setBase: () => void;
}) {
  const rows = [
    [
      "Expected net contribution",
      money(baseline?.summary.expected_contribution_eur),
      money(result?.summary.expected_contribution_eur),
      signedMoney(delta),
    ],
    [
      "Daily throughput",
      num(baseline?.summary.throughput_mwh) + " MWh",
      num(result?.summary.throughput_mwh) + " MWh",
      signed(
        (result?.summary.throughput_mwh ?? 0) -
          (baseline?.summary.throughput_mwh ?? 0),
        " MWh",
      ),
    ],
    [
      "Equivalent cycles",
      num(baseline?.summary.equivalent_cycles, 2),
      num(result?.summary.equivalent_cycles, 2),
      signed(
        (result?.summary.equivalent_cycles ?? 0) -
          (baseline?.summary.equivalent_cycles ?? 0),
        "",
      ),
    ],
    [
      "Orders",
      String(baseline?.summary.order_count ?? 0),
      String(result?.summary.order_count ?? 0),
      signed(
        (result?.summary.order_count ?? 0) -
          (baseline?.summary.order_count ?? 0),
        "",
      ),
    ],
  ];
  return (
    <>
      <Head
        n="05"
        title="Compare Scenarios"
        text="Measure how changed assumptions affect the recommendation."
        action={
          <button
            className="secondary small"
            disabled={!result}
            onClick={setBase}
          >
            Set as Comparison Baseline
          </button>
        }
      />
      <div className="scenario-callout">
        <strong>Current: {scenario}</strong>
        <span>
          {result?.scenario_name === baseline?.scenario_name
            ? "Run another scenario to reveal the optimization response."
            : "Compared with " +
              (baseline?.scenario_name ?? "the baseline") +
              "."}
        </span>
      </div>
      <p className="scenario-instruction"><strong>How to compare:</strong> choose a scenario in the left panel, run the optimization, then return here. The previous baseline and new completed run will be shown side by side.</p>
      <details className="scenario-definitions">
        <summary>Scenario Definitions</summary>
        <div className="scenario-guide" aria-label="Available scenario definitions">
          <article><strong>Expected Forecast</strong><span>Central illustrative Day-Ahead price expectation and normal availability.</span></article>
          <article><strong>Downside</strong><span>Lower selling peaks and more expensive charging hours test a weaker arbitrage case.</span></article>
          <article><strong>Peak Compression</strong><span>Reduces prices above €80/MWh by €25/MWh to test a narrower market spread.</span></article>
          <article><strong>Availability Stress</strong><span>Removes the battery from operation from 18:00–20:00 to test loss of peak-hour flexibility.</span></article>
        </div>
      </details>
      {result && baseline && (
        <ScenarioOutcomeChart baseline={baseline} current={result} />
      )}
      <div className="compare">
        <div className="compare-row compare-head">
          <strong>Metric</strong>
          <span>Baseline</span>
          <span>Current</span>
          <span>Difference</span>
        </div>
        {rows.map((r) => (
          <div className="compare-row" key={r[0]}>
            <strong>{r[0]}</strong>
            <span>
              <small>Baseline</small>
              {r[1]}
            </span>
            <span>
              <small>Current</small>
              {r[2]}
            </span>
            <span
              className={
                "delta " +
                (r[3].startsWith("−")
                  ? "negative"
                  : r[3] === "–"
                    ? "neutral"
                    : "positive")
              }
            >
              <small>Difference</small>
              {r[3]}
            </span>
          </div>
        ))}
      </div>
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
  change: (v: number) => void;
}) {
  return (
    <label htmlFor={id}>
      <span className="field-label">
        {label}
        {assumption && <span className="assumption">assumption</span>}
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
function TextNumber({
  id,
  label,
  unit,
  value,
  step,
  change,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  step: string;
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
function Proof({ label, value }: { label: string; value: string }) {
  return (
    <div className="proof">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type ConstraintDirection = "minimum" | "maximum";

function constraintRow(
  label: string,
  limit: number,
  observed: number,
  unit: string,
  direction: ConstraintDirection,
  digits = 1,
) {
  const margin = direction === "maximum" ? limit - observed : observed - limit;
  const tolerance = digits === 2 ? 0.005 : 0.05;
  const status = margin < -tolerance ? "Failed" : Math.abs(margin) <= tolerance ? "Binding" : "Passed";
  const magnitude = num(Math.abs(margin), digits) + " " + unit;
  return {
    label,
    limit: num(limit, digits) + " " + unit,
    observed: num(observed, digits) + " " + unit,
    headroom: margin < -tolerance ? magnitude + " short" : magnitude,
    status,
  };
}
function envelopeRow(
  minimum: number,
  maximum: number,
  observedMinimum: number,
  observedMaximum: number,
) {
  const lowerMargin = observedMinimum - minimum;
  const upperMargin = maximum - observedMaximum;
  const margin = Math.min(lowerMargin, upperMargin);
  // Match the backend proposal-validation tolerance so rounded auction orders
  // cannot appear invalid in the UI after the API has accepted them.
  const tolerance = 0.15;
  const status = margin < -tolerance ? "Failed" : Math.abs(margin) <= tolerance ? "Binding" : "Passed";
  return {
    label: "State-of-charge envelope",
    limit: `${num(minimum)}–${num(maximum)} MWh`,
    observed: `${num(observedMinimum)}–${num(observedMaximum)} MWh`,
    headroom: margin < -tolerance ? `${num(Math.abs(margin))} MWh outside` : `${num(Math.max(0, margin))} MWh nearest limit`,
    status,
  };
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
const signed = (v: number, u: string) =>
  Math.abs(v) < 0.005
    ? "–"
    : (v > 0 ? "+ " : "− ") + num(Math.abs(v), u.includes("MWh") ? 1 : 2) + u;
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
function scenarioDescription(v: string) {
  return v === "Downside"
    ? "Illustrative Day-Ahead forecast with a €15/MWh peak reduction."
    : v === "Peak compression"
      ? "Illustrative Day-Ahead peaks reduced by €25/MWh to test spread risk."
      : v === "Availability stress"
        ? "Illustrative 18:00–20:00 outage; dispatch re-optimizes around unavailable peak intervals."
        : "Illustrative central Day-Ahead price forecast.";
}
function validate(b: Battery, d: string, u: string) {
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
  try {
    parseIntervals(u);
  } catch (e) {
    return e instanceof Error ? e.message : "Check unavailable intervals.";
  }
  return "";
}
function parseIntervals(v: string) {
  if (!v.trim()) return [];
  const t = v.split(",").map((x) => x.trim());
  if (t.some((x) => x === ""))
    throw new Error("Remove empty unavailable-interval entries.");
  const n = t.map(Number);
  if (n.some((x) => !Number.isInteger(x) || x < 0))
    throw new Error(
      "Unavailable intervals must be non-negative whole numbers.",
    );
  return [...new Set(n)].sort((a, b) => a - b);
}
