"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Plus, RotateCcw, X, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import { parseForecast } from "@/lib/forecast-parser";
import {
  validateBattery,
  validateOrders,
  type DraftOrderInput,
} from "@/lib/order-simulation-validation";
import { OrderRow, SimulationResults } from "./order-evidence";
import { SimulationValidation } from "./simulation-validation";
import { SimulationComparison } from "./simulation-comparison";
import { workspaceView, workspaceUrl } from "@/lib/workspace-navigation";
import { ForecastPlot } from "@/components/dispatch-chart";
import { SavedRunComparison } from "@/components/comparison/saved-run-comparison";
import { SensitivityPanel } from "@/components/sensitivity-panel";
import type {
  Battery,
  Market,
  OrderSimulation,
  Simulation,
  SubmittedOrder,
} from "@/types/api";
import { WorkspaceHistory } from "./workspace-history";

type Point = { timestamp_utc: string; price_eur_mwh: number };
type Draft = {
  date: string;
  battery: Battery;
  market: Market;
  points: Point[];
  prices: string[];
  orders: DraftOrderInput[];
  sourceProposalId?: string;
  forecast?: OrderSimulation["forecast"];
};
type Preview = {
  proposal: Simulation;
  orders: SubmittedOrder[];
  pricing_policy: string;
};
type View = "orders" | "schedule" | "proof" | "compare";
const STORAGE = "iwb-order-workspace-v2";
const num = (n: number, digits = 1) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(n);
const euro = (n: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
export const clock = (timestamp: string, zone = "Europe/Zurich") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
const identity = (draft: Draft) => JSON.stringify(draft);
const id = () => crypto.randomUUID();
const fromOrders = (
  orders: SubmittedOrder[],
  points: Point[],
): DraftOrderInput[] =>
  orders.map((o) => ({
    id: o.client_order_id,
    interval: points.findIndex(
      (p) => Date.parse(p.timestamp_utc) === Date.parse(o.delivery_start_utc),
    ),
    side: o.side,
    orderType: o.order_type,
    volume: String(o.volume_mw),
    limit: o.limit_price_eur_mwh == null ? "" : String(o.limit_price_eur_mwh),
  }));
function examples(): DraftOrderInput[] {
  return [
    [5, "BUY", "MARKET", 20, ""],
    [6, "BUY", "LIMIT", 20, "40"],
    [18, "SELL", "MARKET", 15, ""],
    [19, "SELL", "LIMIT", 15, "100"],
  ].map(([interval, side, orderType, volume, limit]) => ({
    id: id(),
    interval: Number(interval),
    side: side as "BUY" | "SELL",
    orderType: orderType as "MARKET" | "LIMIT",
    volume: String(volume),
    limit: String(limit),
  }));
}

export function UnifiedWorkbench() {
  const [draft, setDraft] = useState<Draft>();
  const [result, setResult] = useState<OrderSimulation>();
  const [resultKey, setResultKey] = useState("");
  const [view, setView] = useState<View>("orders");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
    "forecast" | "battery" | "costs" | "proposal" | "history" | null
  >(null);
  const [preview, setPreview] = useState<Preview>();
  const [previewKey, setPreviewKey] = useState("");
  const [proposal, setProposal] = useState<Simulation>();
  const [undo, setUndo] = useState<Draft>();
  const [risk, setRisk] = useState("expected_value");
  const [horizon, setHorizon] = useState("minimum_reserve");
  const [terminal, setTerminal] = useState("55");
  const [weights, setWeights] = useState(["20", "60", "20"]);
  const [lookahead, setLookahead] = useState("4");
  const [confirmation, setConfirmation] = useState<{
    message: string;
    action: () => void;
  }>();
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const requestId = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const [configurationOpen, setConfigurationOpen] = useState(true);
  const [comparisonKind, setComparisonKind] = useState<
    "simulations" | "proposals"
  >("simulations");
  const selectComparison = (kind: "simulations" | "proposals") => {
    setComparisonKind(kind);
    const url = new URL(location.href);
    url.searchParams.set("comparison", kind);
    history.replaceState({}, "", url);
  };
  const dirty = Boolean(draft && resultKey !== identity(draft));
  const navigate = (next: View) => {
    setView(next);
    history.pushState({}, "", workspaceUrl(new URL(location.href), next));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const load = async () => {
    setBusy("Loading");
    setError("");
    try {
      const [configuration, forecast] = await Promise.all([
        api<{ battery: Battery; market: Market }>("/api/configuration"),
        api<{ points: Point[] }>("/api/forecast?delivery_date=2026-09-09"),
      ]);
      setDraft({
        date: "2026-09-09",
        ...configuration,
        points: forecast.points,
        prices: forecast.points.map((p) => String(p.price_eur_mwh)),
        orders: examples(),
        forecast: {
          source_type: "illustrative",
          source_name: "Illustrative Day-Ahead example",
          version: "illustrative-v1",
          bidding_zone: configuration.market.bidding_zone,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load inputs");
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    const restoreView = () => {
      const params = new URLSearchParams(location.search);
      setView(workspaceView(params));
      setComparisonKind(
        params.get("comparison") === "simulations"
          ? "simulations"
          : params.get("comparison") === "proposals" ||
              params.has("runs") ||
              params.get("workspace") === "analysis"
            ? "proposals"
            : "simulations",
      );
      if (params.get("workspace") === "history") setModal("history");
    };
    addEventListener("popstate", restoreView);
    const timer = setTimeout(() => {
      if (window.matchMedia?.("(max-width: 850px)").matches)
        setConfigurationOpen(false);
      restoreView();
      let restored = false;
      try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
        if (
          saved?.draft?.battery &&
          saved.draft.market &&
          Array.isArray(saved.draft.orders) &&
          Array.isArray(saved.draft.points) &&
          saved.draft.points.length > 0 &&
          Array.isArray(saved.draft.prices) &&
          saved.draft.prices.length === saved.draft.points.length
        ) {
          setDraft(saved.draft);
          setResult(saved.result);
          setResultKey(saved.resultKey ?? "");
          setProposal(saved.proposal);
          if (saved.policy) {
            setRisk(saved.policy.risk ?? "expected_value");
            setHorizon(saved.policy.horizon ?? "minimum_reserve");
            setTerminal(saved.policy.terminal ?? "55");
            setWeights(saved.policy.weights ?? ["20", "60", "20"]);
            setLookahead(saved.policy.lookahead ?? "4");
          }
          restored = true;
        }
      } catch {
        /* A corrupt local snapshot does not block initialization. */
      }
      if (!restored) void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      removeEventListener("popstate", restoreView);
    };
  }, []);
  useEffect(() => {
    if (draft) {
      try {
        sessionStorage.setItem(
          STORAGE,
          JSON.stringify({
            draft,
            result,
            resultKey,
            proposal,
            policy: { risk, horizon, terminal, weights, lookahead },
          }),
        );
      } catch {
        /* Storage can be unavailable; in-memory workspace remains usable. */
      }
    }
  }, [
    draft,
    result,
    resultKey,
    proposal,
    risk,
    horizon,
    terminal,
    weights,
    lookahead,
  ]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = (patch: Partial<Draft>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            ...patch,
            forecast:
              patch.forecast ??
              (patch.prices
                ? {
                    source_type: "manual",
                    source_name: "Entered Day-Ahead forecast",
                    version: "workspace-edited",
                    bidding_zone: current.market.bidding_zone,
                  }
                : current.forecast),
          }
        : current,
    );
    setError("");
    setNotice("");
  };
  const batteryIssues = useMemo(
    () => (draft ? validateBattery(draft.battery) : {}),
    [draft],
  );
  const orderIssues = useMemo(
    () =>
      draft
        ? validateOrders(
            draft.orders,
            draft.market,
            draft.battery,
            draft.points.length,
          )
        : {},
    [draft],
  );
  const priceIssues =
    draft?.prices.map(
      (p) =>
        !p.trim() ||
        !Number.isFinite(Number(p)) ||
        Number(p) < draft.market.min_price_eur_mwh ||
        Number(p) > draft.market.max_price_eur_mwh,
    ) ?? [];
  const issues =
    Object.keys(batteryIssues).length +
    Object.keys(orderIssues).length +
    priceIssues.filter(Boolean).length;
  const requestBody = (snapshot: Draft) => ({
    delivery_date: snapshot.date,
    battery: snapshot.battery,
    market: snapshot.market,
    price_values: snapshot.prices.map(Number),
    forecast: snapshot.forecast ?? {
      source_type: "manual",
      source_name: "Entered Day-Ahead forecast",
      version: `workspace-${snapshot.date}`,
      bidding_zone: snapshot.market.bidding_zone,
    },
  });
  const validate = (includeOrders = true) => {
    const count =
      issues - (includeOrders ? 0 : Object.keys(orderIssues).length);
    if (count) {
      setError(`${count} input issue(s). Check highlighted fields.`);
      if (Object.keys(batteryIssues).length) setModal("battery");
      else if (priceIssues.some(Boolean)) setModal("forecast");
      else {
        setSelected(Object.keys(orderIssues)[0]?.split(".")[1] ?? "");
        navigate("orders");
      }
      setTimeout(() => errorRef.current?.focus(), 0);
      return false;
    }
    return true;
  };
  const simulate = async () => {
    if (!draft || !validate()) return;
    const snapshot = draft,
      key = identity(snapshot),
      ticket = ++requestId.current;
    setBusy("Simulating");
    setError("");
    try {
      const next = await api<OrderSimulation>("/api/order-simulations", {
        method: "POST",
        body: JSON.stringify({
          ...requestBody(snapshot),
          source_proposal_id: snapshot.sourceProposalId,
          orders: snapshot.orders.map((o) => ({
            client_order_id: o.id,
            delivery_start_utc: snapshot.points[o.interval].timestamp_utc,
            side: o.side,
            order_type: o.orderType,
            volume_mw: Number(o.volume),
            limit_price_eur_mwh:
              o.orderType === "LIMIT" ? Number(o.limit) : null,
          })),
        }),
      });
      if (ticket === requestId.current) {
        setResult(next);
        setResultKey(key);
        setNotice("");
        navigate("schedule");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      if (ticket === requestId.current) setBusy("");
    }
  };
  const generate = async () => {
    if (!draft || !validate(false)) return;
    const w = weights.map(Number);
    if (
      w.some(
        (n, i) => !weights[i].trim() || !Number.isFinite(n) || n < 0 || n > 100,
      ) ||
      Math.abs(w.reduce((a, b) => a + b, 0) - 100) > 1e-6 ||
      (horizon === "terminal_value" &&
        (!terminal.trim() ||
          !Number.isFinite(Number(terminal)) ||
          Number(terminal) < 0)) ||
      (["next_day_proxy", "multi_day"].includes(horizon) &&
        (!Number.isInteger(Number(lookahead)) ||
          Number(lookahead) < 1 ||
          Number(lookahead) > 24))
    ) {
      setError(
        "Use probabilities totalling 100%, a non-negative terminal value and 1–24 lookahead hours.",
      );
      return;
    }
    const snapshot = draft;
    setBusy("Generating");
    setError("");
    try {
      const next = await api<Preview>("/api/proposal-preview", {
        method: "POST",
        body: JSON.stringify({
          ...requestBody(snapshot),
          risk_posture: risk,
          horizon_policy: horizon,
          terminal_value_eur_per_mwh:
            horizon === "terminal_value" ? Number(terminal) : 0,
          lookahead_hours: ["next_day_proxy", "multi_day"].includes(horizon)
            ? Number(lookahead)
            : 4,
          scenario_probabilities: {
            downside: w[0] / 100,
            expected: w[1] / 100,
            upside: w[2] / 100,
          },
        }),
      });
      setPreview(next);
      setPreviewKey(identity(snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposal failed");
    } finally {
      setBusy("");
    }
  };
  const apply = () => {
    if (!draft || !preview) return;
    if (identity(draft) !== previewKey) {
      setError("Inputs changed. Generate a new proposal before applying it.");
      return;
    }
    setUndo(draft);
    change({
      orders: fromOrders(preview.orders, draft.points),
      sourceProposalId: preview.proposal.simulation_id,
    });
    setProposal(preview.proposal);
    setSelected(preview.orders[0]?.client_order_id ?? "");
    setModal(null);
    navigate("orders");
    setNotice(
      "Proposal applied to the editable order list. Simulate to evaluate these orders.",
    );
  };
  const changeDate = async (
    value: string,
    confirmed = false,
    minutes = draft?.market.product_minutes ?? 60,
  ) => {
    if (
      !draft ||
      !value ||
      (value === draft.date && minutes === draft.market.product_minutes)
    )
      return;
    if (!confirmed) {
      setConfirmation({
        message:
          "Changing the date or duration loads its example forecast and clears orders. Battery settings are preserved; interval availability is cleared.",
        action: () => void changeDate(value, true, minutes),
      });
      return;
    }
    const originalKey = identity(draft);
    setBusy("Loading date");
    try {
      const next = await api<{ points: Point[] }>(
        `/api/forecast?delivery_date=${value}&product_minutes=${minutes}`,
      );
      if (!draftRef.current || identity(draftRef.current) !== originalKey)
        throw new Error(
          "Inputs changed while loading. Change the date again to retry.",
        );
      setUndo(draft);
      change({
        date: value,
        market: { ...draft.market, product_minutes: minutes },
        points: next.points,
        prices: next.points.map((p) => String(p.price_eur_mwh)),
        forecast: {
          source_type: "illustrative",
          source_name: "Illustrative Day-Ahead example",
          version: "illustrative-v1",
          bidding_zone: draft.market.bidding_zone,
        },
        orders: [],
        battery: { ...draft.battery, unavailable_intervals: [] },
        sourceProposalId: undefined,
      });
      setSelected("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const restore = async (runId: string, kind: string, confirmed = false) => {
    if (busy) return;
    if (kind === "ORDER_SIMULATION" && draft && dirty && !confirmed) {
      setConfirmation({
        message:
          "Replace the current inputs with this saved snapshot? You can undo the replacement.",
        action: () => void restore(runId, kind, true),
      });
      return;
    }
    const originalKey = draft ? identity(draft) : "";
    setBusy("Restoring");
    try {
      if (kind === "ORDER_SIMULATION") {
        const r = await api<OrderSimulation>(`/api/order-simulations/${runId}`);
        if (draftRef.current && identity(draftRef.current) !== originalKey)
          throw new Error(
            "Inputs changed while restoring. Open the saved run again to retry.",
          );
        const d: Draft = {
          date: r.delivery_date,
          battery: r.battery,
          market: r.market,
          points: r.forecast_points,
          prices: r.forecast_points.map((p) => String(p.price_eur_mwh)),
          forecast: r.forecast,
          orders: fromOrders(r.submitted_orders, r.forecast_points),
          sourceProposalId:
            typeof r.audit.source_proposal_id === "string"
              ? r.audit.source_proposal_id
              : undefined,
        };
        setDraft(d);
        setUndo(draft);
        setSelected("");
        setNotice("");
        setResult(r);
        setResultKey(identity(d));
        setModal(null);
        navigate("schedule");
      } else {
        const p = await api<Simulation>(`/api/simulations/${runId}`);
        setProposal(p);
        setModal(null);
        setComparisonKind("proposals");
        navigate("compare");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const loadExample = async () => {
    if (!draft || busy) return;
    const originalKey = identity(draft);
    setBusy("Loading example");
    setError("");
    try {
      const x = await api<{ points: Point[] }>(
        `/api/forecast?delivery_date=${draft.date}&product_minutes=${draft.market.product_minutes}`,
      );
      if (!draftRef.current || identity(draftRef.current) !== originalKey)
        throw new Error(
          "Inputs changed while loading. Load the example again to retry.",
        );
      setUndo(draft);
      change({
        points: x.points,
        prices: x.points.map((p) => String(p.price_eur_mwh)),
        forecast: {
          source_type: "illustrative",
          source_name: "Illustrative Day-Ahead example",
          version: "illustrative-v1",
          bidding_zone: draft.market.bidding_zone,
        },
        orders: draft.market.product_minutes === 60 ? examples() : [],
        sourceProposalId: undefined,
      });
      setSelected("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load example. Try again.",
      );
    } finally {
      setBusy("");
    }
  };
  const sensitivity = async () => {
    if (!proposal) return;
    setBusy("Calculating sensitivities");
    try {
      const snapshot = proposal;
      const next = await api<{
        items: NonNullable<Simulation["sensitivities"]>;
      }>(`/api/simulations/${snapshot.simulation_id}/sensitivities`, {
        method: "POST",
      });
      setProposal((current) =>
        current?.simulation_id === snapshot.simulation_id
          ? { ...current, sensitivities: next.items }
          : current,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };

  if (!draft)
    return (
      <main className="simulator-loading" role={error ? "alert" : "status"}>
        {error ? (
          <div>
            <h1>Workbench unavailable</h1>
            <p>{error}</p>
            <button onClick={() => void load()}>Retry Loading</button>
          </div>
        ) : (
          "Loading workbench…"
        )}
      </main>
    );
  const current = draft.orders.find((o) => o.id === selected);
  return (
    <div className="order-workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <header className="ws-header">
        <div className="ws-brand">
          <span className="logo">IWB</span>
          <div>
            <h1>BESS Day-Ahead Workbench</h1>
            <small>Day-Ahead orders · simulation & optimization</small>
          </div>
        </div>
        <div className="ws-actions">
          <button
            className="ws-text-button"
            onClick={() => setModal("history")}
          >
            Saved history
          </button>
          <a href="/audit/">Decision Log</a>
          <span className="uw-demo">Demo · No live submission</span>
        </div>
      </header>
      <div
        className="uw-layout"
        data-config={configurationOpen ? "open" : "closed"}
      >
        <aside
          className="uw-config"
          aria-label="Shared case configuration"
          hidden={!configurationOpen}
        >
          <div className="ws-section-head">
            <h2>Configure case</h2>
            <button
              className="icon-button"
              aria-label="Collapse configuration"
              onClick={() => setConfigurationOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <details className="uw-config-section market" open>
            <summary>
              <span className="uw-step">1</span>Market & Forecast
            </summary>
            <label>
              Delivery date
              <input
                id="delivery-date"
                name="delivery-date"
                type="date"
                value={draft.date}
                disabled={Boolean(busy)}
                onChange={(e) => void changeDate(e.target.value)}
              />
            </label>
            <label>
              Product duration
              <select
                value={draft.market.product_minutes}
                disabled={Boolean(busy)}
                onChange={(e) =>
                  void changeDate(
                    draft.date,
                    false,
                    Number(e.target.value) as 15 | 60,
                  )
                }
              >
                <option value={60}>60 minutes</option>
                <option value={15}>15 minutes · simulation</option>
              </select>
            </label>
            <p className="ws-help">
              {draft.market.bidding_zone} · {draft.market.timezone} ·{" "}
              {draft.points.length} intervals
            </p>
            <div className="uw-input-summary">
              <strong>Day-Ahead forecast</strong>
              <span>
                {priceIssues.filter((x) => !x).length}/{draft.points.length}{" "}
                valid
              </span>
              <small>{draft.forecast?.source_name ?? "Entered forecast"}</small>
            </div>
            <button className="secondary" onClick={() => setModal("forecast")}>
              Edit prices
            </button>
            <p className="ws-help">
              Used as the assumed auction clearing price.
            </p>
            <button
              className="ws-text-button"
              onClick={() => setModal("costs")}
            >
              Transaction costs
            </button>
          </details>
          <details className="uw-config-section battery" open>
            <summary>
              <span className="uw-step">2</span>Battery & Availability
            </summary>
            <div className="uw-battery-summary">
              <div>
                <strong>{num(draft.battery.capacity_mwh)} MWh</strong>
                <small>Capacity</small>
              </div>
              <div>
                <strong>
                  {num(
                    Math.min(
                      draft.battery.max_charge_power_mw,
                      draft.battery.grid_limit_mw,
                    ),
                  )}{" "}
                  MW
                </strong>
                <small>Effective charge</small>
              </div>
              <div>
                <strong>
                  {num(draft.battery.min_soc_mwh)}–
                  {num(draft.battery.max_soc_mwh)} MWh
                </strong>
                <small>SoC window</small>
              </div>
              <div>
                <strong>{num(draft.battery.target_soc_mwh)} MWh</strong>
                <small>End reserve</small>
              </div>
            </div>
            <p className="ws-help">
              {draft.battery.unavailable_intervals.length} unavailable intervals
              · {num(draft.battery.max_equivalent_cycles)} EFC budget
            </p>
            <button className="secondary" onClick={() => setModal("battery")}>
              Battery settings
            </button>
          </details>
          <details className="uw-config-section policy">
            <summary>
              <span className="uw-step">3</span>Optimization Settings
            </summary>
            <p className="ws-help">
              Used only when generating a proposal. Does not change execution of
              entered orders.
            </p>
            <div className="ws-fields">
              <label>
                Decision posture
                <select
                  value={risk}
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    setRisk(e.target.value);
                    setPreview(undefined);
                  }}
                >
                  <option value="expected_value">Expected value</option>
                  <option value="balanced">Balanced</option>
                  <option value="downside_protected">Downside protected</option>
                </select>
              </label>
              <label>
                End-of-day policy
                <select
                  value={horizon}
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    setHorizon(e.target.value);
                    setPreview(undefined);
                  }}
                >
                  <option value="minimum_reserve">Minimum reserve</option>
                  <option value="terminal_value">
                    Configured terminal value
                  </option>
                  <option value="next_day_proxy">
                    Next-day replacement proxy
                  </option>
                  <option value="multi_day">Next-day opportunity proxy</option>
                </select>
              </label>
              {horizon === "terminal_value" && (
                <label>
                  Terminal value €/MWh
                  <input
                    type="number"
                    value={terminal}
                    disabled={Boolean(busy)}
                    onChange={(e) => {
                      setTerminal(e.target.value);
                      setPreview(undefined);
                    }}
                  />
                </label>
              )}
              {["next_day_proxy", "multi_day"].includes(horizon) && (
                <label>
                  Lookahead hours
                  <input
                    type="number"
                    value={lookahead}
                    disabled={Boolean(busy)}
                    onChange={(e) => {
                      setLookahead(e.target.value);
                      setPreview(undefined);
                    }}
                  />
                </label>
              )}
            </div>
            <details>
              <summary>Scenario probabilities</summary>
              <div className="ws-fields">
                {["Downside %", "Central %", "Upside %"].map((label, i) => (
                  <label key={label}>
                    {label}
                    <input
                      type="number"
                      value={weights[i]}
                      disabled={Boolean(busy)}
                      onChange={(e) => {
                        setWeights((w) =>
                          w.map((v, j) => (j === i ? e.target.value : v)),
                        );
                        setPreview(undefined);
                      }}
                    />
                  </label>
                ))}
              </div>
              <p>
                Best of three evaluated candidate schedules; probabilities must
                total 100%.
              </p>
            </details>
          </details>
        </aside>
        <div className="uw-content">
          <div className="uw-toolbar">
            <button
              className="secondary small"
              aria-expanded={configurationOpen}
              onClick={() => setConfigurationOpen(!configurationOpen)}
            >
              {configurationOpen ? "Hide configuration" : "Configure case"}
            </button>
            <span>
              {draft.date} · {draft.market.bidding_zone} ·{" "}
              {draft.market.product_minutes} min
            </span>
            <button
              className="primary compact"
              disabled={Boolean(busy)}
              onClick={() => void simulate()}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={15} />
                  {busy}…
                </>
              ) : (
                "Simulate orders"
              )}
            </button>
          </div>
          {result && (
            <div
              className="uw-kpis"
              aria-label={
                dirty
                  ? "Previous simulation metrics"
                  : "Current simulation metrics"
              }
            >
              <div>
                <span>Simulated net contribution</span>
                <strong>{euro(result.summary.net_contribution_eur)}</strong>
                <small>Sales − purchases − costs</small>
              </div>
              <div>
                <span>Executed orders</span>
                <strong>
                  {result.summary.executed_order_count} /{" "}
                  {result.summary.submitted_order_count}
                </strong>
                <small>Executed / entered</small>
              </div>
              <div>
                <span>Battery throughput</span>
                <strong>{num(result.summary.throughput_mwh)} MWh</strong>
                <small>{num(result.summary.equivalent_cycles, 2)} EFC</small>
              </div>
              <div>
                <span>Final SoC</span>
                <strong>{num(result.summary.final_soc_mwh)} MWh</strong>
                <small>Reserve {num(result.battery.target_soc_mwh)} MWh</small>
              </div>
            </div>
          )}
          <nav className="uw-tabs" aria-label="Workbench views">
            {(
              [
                ["orders", "Auction Orders"],
                ["schedule", "Dispatch & Economics"],
                ["proof", "Physical Validation"],
                ["compare", "Compare Runs"],
              ] as const
            ).map(([key, label]) => (
              <a
                key={key}
                href={`?tab=${key}`}
                aria-current={view === key ? "page" : undefined}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    navigate(key);
                  }
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <main id="workspace-main">
            {error && (
              <div
                className="banner error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {error}
              </div>
            )}
            {notice && (
              <div className="ws-notice" role="status">
                {notice}
              </div>
            )}
            {undo && (
              <div className="ws-notice">
                Previous inputs can be restored.{" "}
                <button
                  onClick={() => {
                    setDraft(undo);
                    setUndo(undefined);
                    setNotice("Previous inputs restored.");
                  }}
                >
                  Undo
                </button>
              </div>
            )}
            {result && dirty && (
              <div className="stale-notice" role="status">
                Inputs changed. The displayed result is a previous snapshot;
                re-run to update it.
              </div>
            )}
            {view === "orders" && (
              <>
                <section className="ws-card">
                  <div className="ws-section-head">
                    <h2>
                      Orders <small>{draft.orders.length}</small>
                    </h2>
                    <div>
                      <button
                        className="secondary small"
                        onClick={() => {
                          const o: DraftOrderInput = {
                            id: id(),
                            interval: 0,
                            side: "BUY",
                            orderType: "LIMIT",
                            volume: "10",
                            limit: draft.prices[0] ?? "",
                          };
                          change({ orders: [...draft.orders, o] });
                          setSelected(o.id);
                        }}
                      >
                        <Plus size={14} />
                        Add order
                      </button>
                      <button
                        className="secondary small"
                        onClick={() => {
                          setPreview(undefined);
                          setModal("proposal");
                        }}
                      >
                        Generate proposal
                      </button>
                    </div>
                  </div>
                  <div
                    className={`ws-order-layout ${current ? "editing" : ""}`}
                  >
                    <div className="table-scroll">
                      <table className="ws-orders">
                        <caption className="sr-only">Entered orders</caption>
                        <thead>
                          <tr>
                            <th>Delivery</th>
                            <th>Side</th>
                            <th>Type</th>
                            <th>Volume MW</th>
                            <th>Limit €/MWh</th>
                            <th>Simulation status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...draft.orders]
                            .sort((a, b) => a.interval - b.interval)
                            .map((o) => (
                              <tr
                                key={o.id}
                                className={selected === o.id ? "selected" : ""}
                              >
                                <td>
                                  <button
                                    className="ws-row-link"
                                    aria-label={`Edit ${clock(draft.points[o.interval].timestamp_utc, draft.market.timezone)} ${o.side} order`}
                                    onClick={() => setSelected(o.id)}
                                  >
                                    {clock(
                                      draft.points[o.interval].timestamp_utc,
                                      draft.market.timezone,
                                    )}
                                    –
                                    {clock(
                                      new Date(
                                        Date.parse(
                                          draft.points[o.interval]
                                            .timestamp_utc,
                                        ) +
                                          draft.market.product_minutes * 60000,
                                      ).toISOString(),
                                      draft.market.timezone,
                                    )}
                                  </button>
                                </td>
                                <td>
                                  <span
                                    className={`side ${o.side.toLowerCase()}`}
                                  >
                                    {o.side}
                                  </span>
                                </td>
                                <td>
                                  {o.orderType === "MARKET"
                                    ? "Market"
                                    : "Limit"}
                                </td>
                                <td>{o.volume || "—"}</td>
                                <td>
                                  {o.orderType === "MARKET"
                                    ? "No limit"
                                    : o.limit || "—"}
                                  {Object.keys(orderIssues).some((k) =>
                                    k.startsWith(`order.${o.id}.`),
                                  ) && (
                                    <span className="field-error">
                                      Check input
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {!result
                                    ? "Not simulated"
                                    : dirty
                                      ? "Re-simulate"
                                      : (() => {
                                          const outcome =
                                            result.order_results.find(
                                              (item) =>
                                                item.submitted_order
                                                  .client_order_id === o.id,
                                            );
                                          return outcome
                                            ? outcome.execution_status ===
                                              "EXECUTED"
                                              ? "Executed"
                                              : outcome.execution_status ===
                                                  "NOT_EXECUTED"
                                                ? "Price condition not met"
                                                : "Physically infeasible"
                                            : "Not simulated";
                                        })()}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!draft.orders.length && (
                        <p className="ws-empty">
                          No orders yet. Add an order or generate a proposal.
                        </p>
                      )}
                    </div>
                    {current && (
                      <aside className="ws-order-editor">
                        <div className="ws-section-head">
                          <h3>
                            {current.side} ·{" "}
                            {draft.points[current.interval]
                              ? clock(
                                  draft.points[current.interval].timestamp_utc,
                                  draft.market.timezone,
                                )
                              : "Select delivery"}
                          </h3>
                          <button
                            aria-label="Close order editor"
                            className="icon-button"
                            onClick={() => setSelected("")}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <OrderRow
                          order={current}
                          rowIndex={draft.orders.indexOf(current)}
                          points={draft.points}
                          prices={draft.prices}
                          market={draft.market}
                          issues={orderIssues}
                          update={(oid, patch) =>
                            change({
                              orders: draft.orders.map((o) =>
                                o.id === oid ? { ...o, ...patch } : o,
                              ),
                            })
                          }
                          remove={(o) => {
                            setUndo(draft);
                            change({
                              orders: draft.orders.filter((x) => x.id !== o.id),
                            });
                            setSelected("");
                          }}
                        />
                        <p className="ws-help">
                          {num(
                            (Number(current.volume || 0) *
                              draft.market.product_minutes) /
                              60,
                          )}{" "}
                          MWh for this interval. Physical feasibility is checked
                          when simulated. Changes update the draft; re-simulate
                          to update results.
                        </p>
                      </aside>
                    )}
                  </div>
                  <p className="ws-help">
                    Generate proposal suggests orders. Simulate evaluates your
                    entered orders. Same-interval eligible orders execute as a
                    batch; no partial fills.
                  </p>
                </section>
                <button
                  className="ws-text-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    setConfirmation({
                      message:
                        "Load example prices and orders? Battery settings are preserved. You can undo the replacement.",
                      action: () => void loadExample(),
                    })
                  }
                >
                  <RotateCcw size={14} />
                  Load example inputs
                </button>
              </>
            )}
            {view === "schedule" &&
              (result ? (
                <SimulationResults result={result} />
              ) : (
                <section className="ws-card ws-empty">
                  <h2>Dispatch & Economics</h2>
                  <p>
                    Enter a forecast and orders, then simulate to inspect
                    execution and stored energy.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => navigate("orders")}
                  >
                    Go to Auction Orders
                  </button>
                </section>
              ))}
            {view === "proof" &&
              (result ? (
                <SimulationValidation result={result} />
              ) : (
                <section className="ws-card ws-empty">
                  <h2>Physical Validation</h2>
                  <p>
                    Simulate the entered orders to inspect the resulting battery
                    constraints.
                  </p>
                </section>
              ))}
            {view === "compare" && (
              <>
                <div className="uw-comparison-switch">
                  <button
                    className="secondary"
                    aria-pressed={comparisonKind === "simulations"}
                    onClick={() => selectComparison("simulations")}
                  >
                    Order simulations
                  </button>
                  <button
                    className="secondary"
                    aria-pressed={comparisonKind === "proposals"}
                    onClick={() => selectComparison("proposals")}
                  >
                    Optimizer proposals
                  </button>
                </div>
                {comparisonKind === "simulations" ? (
                  <SimulationComparison />
                ) : (
                  <>
                    <section className="ws-card">
                      <h2>Proposal analysis</h2>
                      <p className="ws-help">
                        Optimization proposals and simulated execution are
                        distinct. Cash contribution excludes continuation value.
                        Compare only like-for-like forecasts and asset
                        assumptions.
                      </p>
                      {proposal ? (
                        <>
                          <div className="ws-metrics">
                            <div>
                              Proposal contribution
                              <strong>
                                {euro(
                                  proposal.summary.expected_contribution_eur,
                                )}
                              </strong>
                            </div>
                            <div>
                              Continuation value
                              <strong>
                                {euro(
                                  proposal.summary.terminal_energy_value_eur,
                                )}
                              </strong>
                            </div>
                            <div>
                              Final stored energy
                              <strong>
                                {num(
                                  proposal.summary.proposal_terminal_soc_mwh,
                                )}{" "}
                                MWh
                              </strong>
                            </div>
                          </div>
                          <p className="ws-help">
                            Proposal reference ·{" "}
                            <code>{proposal.simulation_id}</code>
                          </p>
                          <details>
                            <summary>Optimization evidence</summary>
                            <p>
                              Best evaluated candidate under the selected risk
                              preference; not a global robust-optimum guarantee.
                              Next-day policies use an illustrative
                              continuation-value proxy. Break-even estimates are
                              pricing references, not guaranteed margins.
                            </p>
                            <pre>
                              {JSON.stringify(proposal.optimization, null, 2)}
                            </pre>
                          </details>
                          {proposal.sensitivities?.length ? (
                            <SensitivityPanel items={proposal.sensitivities} />
                          ) : (
                            <button
                              className="secondary"
                              disabled={Boolean(busy)}
                              onClick={() => void sensitivity()}
                            >
                              Calculate sensitivities
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="ws-empty">
                          <p>
                            Generate a proposal or open one from History to
                            inspect its evidence.
                          </p>
                          <button
                            className="secondary"
                            onClick={() => setModal("proposal")}
                          >
                            Generate proposal
                          </button>
                          <button
                            className="ws-text-button"
                            onClick={() => setModal("history")}
                          >
                            Open history
                          </button>
                        </div>
                      )}
                    </section>
                    <SavedRunComparison />
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      {modal === "history" && (
        <Dialog title="Saved history" close={() => setModal(null)}>
          <WorkspaceHistory restore={restore} busy={Boolean(busy)} />
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title="Confirm input replacement"
          close={() => setConfirmation(undefined)}
        >
          <p>{confirmation.message}</p>
          <DialogActions>
            <button
              className="secondary"
              onClick={() => setConfirmation(undefined)}
            >
              Cancel replacement
            </button>
            <button
              className="primary"
              onClick={() => {
                const action = confirmation.action;
                setConfirmation(undefined);
                action();
              }}
            >
              Confirm replacement
            </button>
          </DialogActions>
        </Dialog>
      )}
      {modal === "forecast" && (
        <Dialog title="Edit Day-Ahead prices" close={() => setModal(null)}>
          <ForecastEditor
            draft={draft}
            cancel={() => setModal(null)}
            apply={(prices) => {
              change({ prices });
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {(modal === "battery" || modal === "costs") && (
        <Dialog
          title={modal === "costs" ? "Transaction costs" : "Battery settings"}
          close={() => setModal(null)}
        >
          <BatteryEditor
            costsOnly={modal === "costs"}
            draft={draft}
            cancel={() => setModal(null)}
            apply={(patch) => {
              change(patch);
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {modal === "proposal" && (
        <Dialog title="Generate proposal" close={() => setModal(null)}>
          <p>
            Use the current forecast and battery settings to suggest orders.
            Your orders are unchanged until you apply the proposal.
          </p>
          <p>
            Using {risk.replaceAll("_", " ")} · {horizon.replaceAll("_", " ")}.
            Proposal settings are in the configuration panel.
          </p>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {preview && (
            <div className="ws-preview">
              <h3>Review proposal</h3>
              <p>
                {preview.orders.length} Limit orders ·{" "}
                {euro(preview.proposal.summary.expected_contribution_eur)}{" "}
                forecast contribution · final SoC{" "}
                {num(preview.proposal.summary.proposal_terminal_soc_mwh)} MWh
              </p>
              <p>{preview.pricing_policy}</p>
              <p>
                Applying replaces all {draft.orders.length} entered orders. You
                can undo this change.
              </p>
            </div>
          )}
          <DialogActions>
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className={preview ? "secondary" : "primary"}
              disabled={Boolean(busy)}
              onClick={() => void generate()}
            >
              {busy ? `${busy}…` : "Generate preview"}
            </button>
            {preview && (
              <button
                className="primary"
                onClick={apply}
                disabled={Boolean(busy)}
              >
                Apply proposal
              </button>
            )}
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}

const DialogFooterContext = createContext<HTMLElement | null>(null);
function DialogActions({ children }: { children: React.ReactNode }) {
  const target = useContext(DialogFooterContext);
  return target
    ? createPortal(<div className="ws-dialog-footer">{children}</div>, target)
    : null;
}
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="ws-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="ws-section-head ws-dialog-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={`Close ${title}`}
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <DialogFooterContext.Provider value={footer}>
        <div className="ws-dialog-body">{children}</div>
      </DialogFooterContext.Provider>
      <div ref={setFooter} className="ws-dialog-footer-slot" />
    </dialog>
  );
}

function ForecastEditor({
  draft,
  apply,
  cancel,
}: {
  draft: Draft;
  apply: (prices: string[]) => void;
  cancel: () => void;
}) {
  const [prices, setPrices] = useState(draft.prices);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const invalid = prices.some(
    (p) =>
      !p.trim() ||
      !Number.isFinite(Number(p)) ||
      Number(p) < draft.market.min_price_eur_mwh ||
      Number(p) > draft.market.max_price_eur_mwh,
  );
  return (
    <>
      <p>
        Day-Ahead forecast · €/MWh · {draft.market.timezone}. Changes are staged
        until you apply them.
      </p>
      <ForecastPlot
        points={draft.points.map((p, i) => ({
          ...p,
          price_eur_mwh:
            prices[i]?.trim() && Number.isFinite(Number(prices[i]))
              ? Number(prices[i])
              : null,
        }))}
        zone={draft.market.timezone}
      />
      <details>
        <summary>Paste prices</summary>
        <p>
          One price per line, or HH:mm;price. For repeated DST hours use ISO
          timestamps with offsets.
        </p>
        <label>
          Paste prices
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="00:00;55…"
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            const parsed = parseForecast(
              paste,
              draft.points.length,
              draft.market.min_price_eur_mwh,
              draft.market.max_price_eur_mwh,
              draft.points,
              draft.market.timezone,
            );
            if (parsed.errors.length)
              setError(parsed.errors.map((e) => e.message).join(" "));
            else {
              setPrices(parsed.values.map(String));
              setError("");
            }
          }}
        >
          Use pasted prices
        </button>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </details>
      <div className="ws-price-grid">
        {draft.points.map((p, i) => (
          <label key={p.timestamp_utc}>
            {clock(p.timestamp_utc, draft.market.timezone)}{" "}
            <small
              className={
                draft.points.filter(
                  (point) =>
                    clock(point.timestamp_utc, draft.market.timezone) ===
                    clock(p.timestamp_utc, draft.market.timezone),
                ).length > 1
                  ? "ws-time-evidence"
                  : "sr-only"
              }
            >
              {new Date(p.timestamp_utc).toISOString().slice(11, 16)} UTC
            </small>
            <input
              aria-label={`Price ${p.timestamp_utc}`}
              name={`price-${i}`}
              autoComplete="off"
              inputMode="decimal"
              aria-invalid={
                !prices[i]?.trim() ||
                !Number.isFinite(Number(prices[i])) ||
                Number(prices[i]) < draft.market.min_price_eur_mwh ||
                Number(prices[i]) > draft.market.max_price_eur_mwh
              }
              aria-describedby={`price-bounds-${i}`}
              type="number"
              step="any"
              value={prices[i]}
              onChange={(e) =>
                setPrices((x) =>
                  x.map((v, j) => (i === j ? e.target.value : v)),
                )
              }
            />
            <small
              id={`price-bounds-${i}`}
              className={
                !prices[i]?.trim() ||
                !Number.isFinite(Number(prices[i])) ||
                Number(prices[i]) < draft.market.min_price_eur_mwh ||
                Number(prices[i]) > draft.market.max_price_eur_mwh
                  ? "field-error"
                  : "sr-only"
              }
            >
              Required: {draft.market.min_price_eur_mwh} to{" "}
              {draft.market.max_price_eur_mwh} €/MWh
            </small>
          </label>
        ))}
      </div>
      {invalid && (
        <p className="field-error">
          Enter every price within configured bounds; blank is not zero.
        </p>
      )}
      <DialogActions>
        <span role="status">
          {
            prices.filter(
              (p) =>
                p.trim() &&
                Number.isFinite(Number(p)) &&
                Number(p) >= draft.market.min_price_eur_mwh &&
                Number(p) <= draft.market.max_price_eur_mwh,
            ).length
          }
          /{draft.points.length} valid
        </span>
        <button className="secondary" onClick={cancel}>
          Cancel
        </button>
        {invalid && (
          <button
            className="ws-text-button"
            onClick={(event) =>
              event.currentTarget
                .closest("dialog")
                ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
                ?.focus()
            }
          >
            Review invalid prices
          </button>
        )}
        <button
          className="primary"
          disabled={invalid}
          onClick={() => apply(prices)}
        >
          Apply prices
        </button>
      </DialogActions>
    </>
  );
}

const BATTERY_FIELDS: [keyof Battery, string, string][] = [
  ["capacity_mwh", "Energy capacity", "MWh"],
  ["max_charge_power_mw", "Charge limit", "MW"],
  ["max_discharge_power_mw", "Discharge limit", "MW"],
  ["grid_limit_mw", "Grid limit", "MW"],
  ["initial_soc_mwh", "Initial SoC", "MWh"],
  ["min_soc_mwh", "Minimum SoC", "MWh"],
  ["max_soc_mwh", "Maximum SoC", "MWh"],
  ["target_soc_mwh", "End reserve", "MWh"],
  ["round_trip_efficiency", "Round-trip efficiency", "ratio 0–1"],
  ["max_equivalent_cycles", "Cycle budget", "EFC"],
  ["degradation_cost_eur_per_mwh", "Degradation cost", "€/battery MWh"],
];
function BatteryEditor({
  costsOnly = false,
  draft,
  apply,
  cancel,
}: {
  costsOnly?: boolean;
  draft: Draft;
  apply: (patch: Partial<Draft>) => void;
  cancel: () => void;
}) {
  const [resetError, setResetError] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [raw, setRaw] = useState(
    Object.fromEntries(
      BATTERY_FIELDS.map(([k]) => [k, String(draft.battery[k])]),
    ),
  );
  const [unavailable, setUnavailable] = useState(
    draft.battery.unavailable_intervals,
  );
  const [fee, setFee] = useState(String(draft.market.exchange_fee_eur_per_mwh));
  const [clearing, setClearing] = useState(
    String(draft.market.clearing_fee_eur_per_mwh),
  );
  const [configured, setConfigured] = useState(
    draft.market.exchange_fee_policy === "configured",
  );
  const b = {
    ...draft.battery,
    ...Object.fromEntries(
      BATTERY_FIELDS.map(([k]) => [k, raw[k]?.trim() ? Number(raw[k]) : NaN]),
    ),
    unavailable_intervals: unavailable,
  };
  const issues = validateBattery(b);
  const feesInvalid = ![fee, clearing].every(
    (x) => x.trim() && Number.isFinite(Number(x)) && Number(x) >= 0,
  );
  return (
    <>
      {!costsOnly && (
        <>
          <p>
            Task baseline: 100 MWh / 50 MW. Two hours is interpreted as nominal
            charge or discharge duration, not a waiting period. Other values are
            assumptions. Ramp limits are not modeled. Changes are staged; Cancel
            discards them.
          </p>
          {[
            {
              title: "Battery & connection",
              keys: [
                "capacity_mwh",
                "max_charge_power_mw",
                "max_discharge_power_mw",
                "grid_limit_mw",
                "round_trip_efficiency",
              ],
            },
            {
              title: "Operating limits",
              keys: [
                "initial_soc_mwh",
                "min_soc_mwh",
                "max_soc_mwh",
                "target_soc_mwh",
                "max_equivalent_cycles",
              ],
            },
            {
              title: "Battery wear cost",
              keys: ["degradation_cost_eur_per_mwh"],
            },
          ].map((group) => (
            <fieldset className="ws-field-group" key={group.title}>
              <legend>{group.title}</legend>
              <div className="ws-fields">
                {BATTERY_FIELDS.filter(([key]) => group.keys.includes(key)).map(
                  ([key, label, unit]) => (
                    <label key={key}>
                      {label}{" "}
                      <small>
                        {key === "round_trip_efficiency" ? "%" : unit}
                      </small>
                      <input
                        type="number"
                        step="any"
                        value={
                          key === "round_trip_efficiency" && raw[key]?.trim()
                            ? Number((Number(raw[key]) * 100).toFixed(8))
                            : raw[key]
                        }
                        name={key}
                        autoComplete="off"
                        aria-label={`${label} ${key === "round_trip_efficiency" ? "%" : unit}`}
                        aria-describedby={
                          issues[key] ? `battery-error-${key}` : undefined
                        }
                        disabled={resetPending}
                        aria-invalid={Boolean(issues[key])}
                        onChange={(e) =>
                          setRaw((x) => ({
                            ...x,
                            [key]:
                              key === "round_trip_efficiency" &&
                              e.target.value.trim()
                                ? String(Number(e.target.value) / 100)
                                : e.target.value,
                          }))
                        }
                      />
                      {issues[key] && (
                        <small
                          id={`battery-error-${key}`}
                          className="field-error"
                        >
                          {issues[key]}
                        </small>
                      )}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          ))}
          <details>
            <summary>Availability</summary>
            <p>Selected intervals are unavailable. No dispatch is permitted.</p>
            <div className="ws-availability">
              {draft.points.map((p, i) => (
                <label key={p.timestamp_utc}>
                  <input
                    type="checkbox"
                    checked={unavailable.includes(i)}
                    onChange={() =>
                      setUnavailable((x) =>
                        x.includes(i) ? x.filter((n) => n !== i) : [...x, i],
                      )
                    }
                  />
                  {clock(p.timestamp_utc, draft.market.timezone)}{" "}
                  <small>{p.timestamp_utc.slice(11, 16)} UTC</small>
                </label>
              ))}
            </div>
          </details>
        </>
      )}
      {costsOnly && (
        <section>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={configured}
              onChange={(e) => setConfigured(e.target.checked)}
            />
            Include confirmed exchange fee
          </label>
          <div className="ws-fields">
            <label>
              Exchange €/MWh
              <input
                type="number"
                step="any"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
            <label>
              Clearing €/MWh
              <input
                type="number"
                step="any"
                value={clearing}
                onChange={(e) => setClearing(e.target.value)}
              />
            </label>
          </div>
          <p>
            Fees apply to executed grid energy on both sides. Confirm tariff
            assumptions with IWB.
          </p>
        </section>
      )}
      <DialogActions>
        <span>Apply to draft · re-simulate to update results</span>
        <button className="secondary" onClick={cancel} disabled={resetPending}>
          Cancel
        </button>
        {Object.keys(issues).length > 0 && (
          <button
            className="ws-text-button"
            onClick={(event) =>
              event.currentTarget
                .closest("dialog")
                ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
                ?.focus()
            }
          >
            Review invalid settings
          </button>
        )}
        <button
          className="primary"
          disabled={
            Object.keys(issues).length > 0 || feesInvalid || resetPending
          }
          onClick={() =>
            apply({
              battery: b,
              market: {
                ...draft.market,
                exchange_fee_eur_per_mwh: Number(fee),
                exchange_fee_policy: configured ? "configured" : "excluded",
                clearing_fee_eur_per_mwh: Number(clearing),
              },
            })
          }
        >
          Apply settings
        </button>
      </DialogActions>
      {feesInvalid && (
        <p role="alert" className="field-error">
          Transaction fees must be non-negative finite values.
        </p>
      )}
      {resetError && (
        <p role="alert" className="field-error">
          {resetError}
        </p>
      )}
      {!costsOnly && (
        <button
          className="secondary"
          disabled={resetPending}
          onClick={() => {
            if (!resetRequested) {
              setResetRequested(true);
              return;
            }
            setResetPending(true);
            setResetError("");
            void api<{ battery: Battery }>("/api/configuration")
              .then((x) => {
                setRaw(
                  Object.fromEntries(
                    BATTERY_FIELDS.map(([k]) => [k, String(x.battery[k])]),
                  ),
                );
                setUnavailable([]);
              })
              .catch((e) =>
                setResetError(
                  e instanceof Error
                    ? e.message
                    : "Could not load baseline. Try again.",
                ),
              )
              .finally(() => {
                setResetPending(false);
                setResetRequested(false);
              });
          }}
        >
          {resetPending
            ? "Restoring baseline…"
            : resetRequested
              ? "Restore baseline in editor"
              : "Reset battery assumptions"}
        </button>
      )}
      {resetRequested && !resetPending && (
        <p role="status">
          This replaces the staged battery values. Nothing is applied until you
          choose Apply settings.{" "}
          <button
            className="ws-text-button"
            onClick={() => setResetRequested(false)}
          >
            Cancel reset
          </button>
        </p>
      )}
    </>
  );
}
