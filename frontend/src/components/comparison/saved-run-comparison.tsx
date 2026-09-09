"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Search, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { comparisonKey, configurationDiff, configurationItems, configurationSignature, formatForecastLabel, runDisplayName } from "@/lib/comparison";
import type { ComparisonMetric, Simulation, SimulationRunSummary } from "@/types/api";

const MAX_RUNS = 4;
const COLORS = { downside: "#7b8e8c", expected: "#16867f", upside: "#e67d11" };
const money = (value: number) => new Intl.NumberFormat("en-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const number = (value: number, digits = 1) => new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
const shortId = (id: string) => id.replace("sim-", "").slice(0, 8);
const words = (value?: string) => (value ?? "not recorded").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function SavedRunComparison() {
  const [catalogue, setCatalogue] = useState<SimulationRunSummary[]>([]);
  const [runs, setRuns] = useState<Simulation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [referenceId, setReferenceId] = useState("");
  const [focusedId, setFocusedId] = useState("");
  const [metric, setMetric] = useState<ComparisonMetric>("contribution");
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("ALL");
  const [validation, setValidation] = useState("ALL");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<{ items: SimulationRunSummary[] }>("/api/simulation-runs?limit=100")
      .then(async ({ items }) => {
        if (!active) return;
        setCatalogue(items);
        const params = new URLSearchParams(location.search);
        const requested = (params.get("runs") ?? "").split(",").filter((id) => items.some((item) => item.simulation_id === id)).slice(0, MAX_RUNS);
        const defaults = requested.length ? requested : items.slice(0, Math.min(2, items.length)).map((item) => item.simulation_id);
        const reference = defaults.includes(params.get("reference") ?? "") ? params.get("reference")! : defaults[0] ?? "";
        const requestedMetric = params.get("metric") as ComparisonMetric | null;
        const nextMetric = ["contribution", "throughput", "cycles", "orders"].includes(requestedMetric ?? "") ? requestedMetric! : "contribution";
        const details = await Promise.all(defaults.map((id) => api<Simulation>(`/api/simulations/${id}`)));
        if (!active) return;
        setSelectedIds(defaults);
        setReferenceId(reference);
        const requestedFocus = params.get("focus") ?? "";
        setFocusedId(defaults.includes(requestedFocus) ? requestedFocus : defaults.find((id) => id !== reference) ?? defaults[0] ?? "");
        setMetric(nextMetric);
        setRuns(details);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Saved runs could not be loaded"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading) return;
    const url = new URL(location.href);
    if (selectedIds.length) url.searchParams.set("runs", selectedIds.join(",")); else url.searchParams.delete("runs");
    if (referenceId) url.searchParams.set("reference", referenceId); else url.searchParams.delete("reference");
    if (focusedId) url.searchParams.set("focus", focusedId); else url.searchParams.delete("focus");
    url.searchParams.set("metric", metric);
    history.replaceState({}, "", url);
  }, [selectedIds, referenceId, focusedId, metric, loading]);

  const addOrRemove = async (id: string) => {
    if (selectedIds.includes(id)) {
      const nextIds = selectedIds.filter((item) => item !== id);
      setSelectedIds(nextIds);
      setRuns((items) => items.filter((item) => item.simulation_id !== id));
      if (referenceId === id) setReferenceId(nextIds[0] ?? "");
      if (focusedId === id) setFocusedId(nextIds.find((item) => item !== referenceId) ?? nextIds[0] ?? "");
      return;
    }
    if (selectedIds.length >= MAX_RUNS) return;
    try {
      const detail = await api<Simulation>(`/api/simulations/${id}`);
      setSelectedIds((items) => [...items, id]);
      setRuns((items) => [...items, detail]);
      if (!referenceId) setReferenceId(id);
      setFocusedId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected run could not be loaded");
    }
  };

  const reference = runs.find((run) => run.simulation_id === referenceId) ?? runs[0];
  const focused = runs.find((run) => run.simulation_id === focusedId) ?? runs.find((run) => run.simulation_id !== referenceId) ?? reference;
  const descriptors = runs.map((run, index) => ({ run, key: comparisonKey(index), name: runDisplayName(run), signature: reference ? configurationSignature(reference, run) : "" }));
  const grouped = new Map<string, typeof descriptors>();
  descriptors.forEach((item) => grouped.set(item.run.audit.input_hash, [...(grouped.get(item.run.audit.input_hash) ?? []), item]));
  const duplicateGroups = [...grouped.values()].filter((items) => items.length > 1);
  const filtered = catalogue.filter((run) => {
    const needle = query.trim().toLowerCase();
    return (!needle || `${run.display_name} ${run.scenario_name} ${run.delivery_date} ${run.simulation_id}`.toLowerCase().includes(needle)) &&
      (product === "ALL" || String(run.product_minutes) === product) &&
      (validation === "ALL" || run.validation_status === validation);
  });

  if (loading) return <div className="state-block"><strong>Loading Saved Runs…</strong><span>Preparing comparable optimizer results.</span></div>;
  if (error && !runs.length) return <div className="state-block" role="alert"><strong>Saved Runs Unavailable</strong><span>{error}. Refresh the page to try again.</span></div>;
  if (!catalogue.length) return <div className="state-block"><strong>No Saved Runs Yet</strong><span>Run the optimizer to create the first comparable decision.</span></div>;

  return <div className="saved-comparison">
    {error && <div className="status-message error" role="alert">{error}</div>}
    <section className="run-selection" aria-labelledby="selected-runs-title">
      <div className="comparison-section-heading">
        <div><span className="eyebrow">SAVED SIMULATIONS</span><h3 id="selected-runs-title">Selected Runs <small>{selectedIds.length}/{MAX_RUNS}</small></h3></div>
        <details className="run-picker">
          <summary aria-label="Add or remove simulation runs"><Plus size={15} aria-hidden="true" /> Add Run <ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="run-picker-panel">
            <div className="run-picker-title"><strong>Choose Up to {MAX_RUNS} Runs</strong><span>Every run retains its exact saved configuration.</span></div>
            <label className="run-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Search saved runs</span><input name="run-search" autoComplete="off" placeholder="Search preset, date or run ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div className="run-filters">
              <label><span className="sr-only">Product duration</span><select name="run-product" value={product} onChange={(event) => setProduct(event.target.value)}><option value="ALL">All Products</option><option value="60">60 Minutes</option><option value="15">15 Minutes</option></select></label>
              <label><span className="sr-only">Validation status</span><select name="run-validation" value={validation} onChange={(event) => setValidation(event.target.value)}><option value="ALL">All Results</option><option value="passed">Passed</option><option value="warning">Warning</option><option value="failed">Failed</option></select></label>
            </div>
            <div className="run-options">{filtered.map((run) => {
              const checked = selectedIds.includes(run.simulation_id);
              const disabled = !checked && selectedIds.length >= MAX_RUNS;
              return <label className={`run-option ${checked ? "selected" : ""}`} key={run.simulation_id}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => addOrRemove(run.simulation_id)} />
                <span><strong>{run.display_name}</strong><small>{formatForecastLabel(run.scenario_name)} · {formatRunTime(run.created_at_utc)} · {run.product_minutes} min · <span translate="no">{shortId(run.simulation_id)}</span></small></span>
                <b>{money(run.expected_contribution_eur)}</b>
              </label>;
            })}</div>
            {!filtered.length && <p className="picker-empty">No saved runs match these filters.</p>}
          </div>
        </details>
      </div>
      <div className="run-chips">{descriptors.map(({ run, key, name, signature }) => <div className={`run-chip ${run.simulation_id === focused?.simulation_id ? "active" : ""}`} key={run.simulation_id}>
        <button type="button" className="run-chip-focus" onClick={() => setFocusedId(run.simulation_id)} aria-pressed={run.simulation_id === focused?.simulation_id}>
          <span><i className="run-key">{key}</i><strong>{name}</strong>{run.simulation_id === referenceId && <b>Reference</b>}</span><small>{formatForecastLabel(run.scenario_name)} · {run.market.product_minutes} min · {shortId(run.simulation_id)}</small><em>{signature}</em>
        </button>
        <button type="button" className="run-chip-remove" aria-label={`Remove ${name} from comparison`} onClick={() => addOrRemove(run.simulation_id)}><X size={13} aria-hidden="true" /></button>
      </div>)}</div>
      {selectedIds.length === 1 && <p className="comparison-prompt">Select at least 1 more completed run to compare results.</p>}
      {duplicateGroups.map((group) => <p className="comparison-prompt neutral" key={group[0].run.audit.input_hash}><Check size={14} aria-hidden="true" /> Runs {group.map((item) => item.key).join(" and ")} use identical configuration inputs; their saved results may still differ by revision or forecast data.</p>)}
    </section>

    {runs.length >= 2 && <>
      <section className="comparison-visual" aria-labelledby="comparison-results-title">
        <div className="comparison-toolbar">
          <div><span className="eyebrow">RUN OUTCOMES</span><h3 id="comparison-results-title">Compare Saved Results</h3><p className="comparison-subtitle">Compare each saved order portfolio using the same 3 Day-Ahead price outcomes.</p></div>
          <div className="metric-switch" role="group" aria-label="Comparison metric">
            {(["contribution", "throughput", "cycles", "orders"] as ComparisonMetric[]).map((item) => <button type="button" aria-pressed={metric === item} className={metric === item ? "active" : ""} key={item} onClick={() => setMetric(item)}>{item === "throughput" ? "Battery Usage" : words(item)}</button>)}
          </div>
        </div>
        {metric === "contribution" && <div className="outcome-explainer" aria-label="How to read the market outcome comparison">
          <div><strong>1 · Saved Run</strong><span>The forecast and configuration used to optimize one order portfolio.</span></div>
          <div><strong>2 · Price Outcomes</strong><span>The same orders are repriced using lower, central and higher DA prices.</span></div>
          <div><strong>3 · Net Contribution</strong><span>Sales minus charging purchases, degradation and transaction fees.</span></div>
        </div>}
        <RunComparisonChart runs={runs} metric={metric} referenceId={referenceId} focusedId={focused?.simulation_id} onFocus={setFocusedId} />
        <ComparisonTable runs={runs} metric={metric} referenceId={referenceId} focusedId={focused?.simulation_id} onFocus={setFocusedId} />
      </section>

      {reference && focused && <RunInspector key={`${focused.simulation_id}:${focused.display_name}`} run={focused} runKey={descriptors.find((item) => item.run.simulation_id === focused.simulation_id)?.key ?? "A"} reference={reference} setReference={() => setReferenceId(focused.simulation_id)} showUnchanged={showUnchanged} setShowUnchanged={setShowUnchanged} onRenamed={(updated) => { setRuns((items) => items.map((item) => item.simulation_id === updated.simulation_id ? updated : item)); setCatalogue((items) => items.map((item) => item.simulation_id === updated.simulation_id ? { ...item, display_name: runDisplayName(updated) } : item)); }} />}
    </>}
  </div>;
}

function RunComparisonChart({ runs, metric, referenceId, focusedId, onFocus }: { runs: Simulation[]; metric: ComparisonMetric; referenceId: string; focusedId?: string; onFocus: (id: string) => void }) {
  const reference = runs.find((run) => run.simulation_id === referenceId) ?? runs[0];
  const data = runs.map((run) => ({
    runId: run.simulation_id,
    name: `${comparisonKey(runs.indexOf(run))} · ${runDisplayName(run)}`,
    forecast: formatForecastLabel(run.scenario_name),
    metadata: `${run.market.product_minutes} min · ${formatRunTime(run.created_at_utc)} · ${shortId(run.simulation_id)}`,
    signature: configurationSignature(reference, run),
    lowerPrice: metric === "contribution" ? outcomeValue(run, "Downside") : metricValue(run, metric),
    centralPrice: metric === "contribution" ? outcomeValue(run, "Expected") : metricValue(run, metric),
    higherPrice: metric === "contribution" ? outcomeValue(run, "Upside") : metricValue(run, metric),
  }));
  const unit = metric === "contribution" ? "EUR" : metric === "throughput" ? "MWh" : metric === "cycles" ? "EFC" : "orders";
  const formatter = (value: number) => metric === "contribution" ? money(value) : `${number(value, metric === "cycles" ? 2 : 1)} ${unit}`;
  const height = Math.max(220, runs.length * (metric === "contribution" ? 76 : 56));
  return <figure className="plot-card run-comparison-chart">
    <figcaption><div className="chart-caption-main"><strong>{metric === "contribution" ? "Net Contribution Under 3 DA Price Outcomes" : `${words(metric)} by Simulation Run`}</strong><span>{metric === "contribution" ? "Each group is 1 saved order portfolio; values are net of purchases, degradation and transaction fees." : "Click a row to inspect the configuration used by that run."}</span></div><div className="chart-legend"><b>{unit}</b></div></figcaption>
    {metric === "contribution" && <div className="market-outcome-legend" aria-label="Price outcome legend"><span><i className="lower" />Lower-price outcome</span><span><i className="central" />Central-price outcome</span><span><i className="higher" />Higher-price outcome</span></div>}
    <div className="plot-area" style={{ height }} role="img" aria-label={`${metric === "contribution" ? "Net contribution under lower, central and higher Day-Ahead price outcomes" : words(metric)} for ${runs.length} selected saved runs`}>
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, bottom: 4, left: 18 }} barCategoryGap="24%">
        <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tickFormatter={(value) => metric === "contribution" ? axisMoney(value) : number(value, metric === "cycles" ? 2 : 0)} tick={{ fontSize: 10, fill: "#607477" }} axisLine={{ stroke: "#b7c7c4" }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={148} tick={{ fontSize: 10, fill: "#284b4d", fontWeight: 650 }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="#748986" />
        <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="comparison-tooltip"><strong>{payload[0].payload.name}</strong><span>{payload[0].payload.forecast} · {payload[0].payload.metadata}</span><em>{payload[0].payload.signature}</em>{payload.map((item) => <div key={String(item.dataKey)}><i style={{ background: String(item.color) }} /><span>{outcomeLegend(String(item.dataKey))}</span><b>{formatter(Number(item.value))}</b></div>)}</div> : null} cursor={{ fill: "rgba(8, 125, 120, .045)" }} />
        {metric === "contribution" ? <>
          <Bar dataKey="lowerPrice" fill={COLORS.downside} radius={[0, 3, 3, 0]} maxBarSize={16} onClick={(_, index) => onFocus(data[index].runId)}>{data.map((row) => <Cell key={`down-${row.runId}`} opacity={focusedId && row.runId !== focusedId ? .55 : 1} cursor="pointer" />)}</Bar>
          <Bar dataKey="centralPrice" fill={COLORS.expected} radius={[0, 3, 3, 0]} maxBarSize={16} onClick={(_, index) => onFocus(data[index].runId)}>{data.map((row) => <Cell key={`expected-${row.runId}`} opacity={focusedId && row.runId !== focusedId ? .55 : 1} cursor="pointer" />)}</Bar>
          <Bar dataKey="higherPrice" fill={COLORS.upside} radius={[0, 3, 3, 0]} maxBarSize={16} onClick={(_, index) => onFocus(data[index].runId)}>{data.map((row) => <Cell key={`up-${row.runId}`} opacity={focusedId && row.runId !== focusedId ? .55 : 1} cursor="pointer" />)}</Bar>
        </> : <Bar dataKey="centralPrice" fill={COLORS.expected} radius={[0, 4, 4, 0]} maxBarSize={24} onClick={(_, index) => onFocus(data[index].runId)}>{data.map((row) => <Cell key={row.runId} opacity={focusedId && row.runId !== focusedId ? .55 : 1} cursor="pointer" />)}</Bar>}
      </BarChart></ResponsiveContainer>
    </div>
  </figure>;
}

function ComparisonTable({ runs, metric, referenceId, focusedId, onFocus }: { runs: Simulation[]; metric: ComparisonMetric; referenceId: string; focusedId?: string; onFocus: (id: string) => void }) {
  const reference = runs.find((run) => run.simulation_id === referenceId) ?? runs[0];
  return <div className="table-scroll comparison-results-table"><table><caption className="sr-only">Accessible comparison of selected simulation runs</caption><thead><tr><th>Saved Run</th>{metric === "contribution" ? <><th>Lower-Price Outcome<small>Net contribution</small></th><th>Central-Price Outcome<small>Net contribution</small></th><th>Higher-Price Outcome<small>Net contribution</small></th><th>Probability-Weighted<small>Using saved probabilities</small></th></> : <th>{words(metric)}</th>}<th>Change vs Reference</th><th>Validation</th></tr></thead><tbody>{runs.map((run, index) => {
    const value = metricValue(run, metric);
    const referenceValue = metricValue(reference, metric);
    return <tr className={run.simulation_id === focusedId ? "active" : ""} aria-current={run.simulation_id === focusedId ? "true" : undefined} key={run.simulation_id} tabIndex={0} onClick={() => onFocus(run.simulation_id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onFocus(run.simulation_id); } }}>
      <td><div className="run-title"><i className="run-key">{comparisonKey(index)}</i><strong>{runDisplayName(run)}</strong>{run.simulation_id === referenceId && <b>Reference</b>}</div><small>{formatForecastLabel(run.scenario_name)} · {formatRunTime(run.created_at_utc)} · {shortId(run.simulation_id)}</small><small>{configurationSignature(reference, run)}</small>{metric === "contribution" && <small>{probabilityLabel(run)}</small>}</td>
      {metric === "contribution" ? <><td>{money(outcomeValue(run, "Downside"))}</td><td>{money(outcomeValue(run, "Expected"))}</td><td>{money(outcomeValue(run, "Upside"))}</td><td><strong>{money(run.risk?.expected_contribution_eur ?? run.summary.expected_contribution_eur)}</strong></td></> : <td>{formatMetric(value, metric)}</td>}
      <td>{run.simulation_id === referenceId ? "Reference" : signedMetric(value - referenceValue, metric)}</td><td><span className={`validation-pill ${run.validation.status}`}>{run.validation.status}</span></td>
    </tr>;
  })}</tbody></table></div>;
}

function RunInspector({ run, runKey, reference, setReference, showUnchanged, setShowUnchanged, onRenamed }: { run: Simulation; runKey: string; reference: Simulation; setReference: () => void; showUnchanged: boolean; setShowUnchanged: (value: boolean) => void; onRenamed: (run: Simulation) => void }) {
  const differences = configurationDiff(reference, run);
  const groups = ["Market", "Strategy", "Battery", "Availability"] as const;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(runDisplayName(run));
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const saveName = async () => {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized) { setRenameError("Enter a visible run name."); return; }
    setSaving(true); setRenameError("");
    try {
      const updated = await api<Simulation>(`/api/simulations/${run.simulation_id}/display-name`, { method: "PATCH", body: JSON.stringify({ display_name: normalized }) });
      onRenamed(updated); setEditing(false);
    } catch (cause) { setRenameError(cause instanceof Error ? cause.message : "The run name could not be saved"); }
    finally { setSaving(false); }
  };
  return <section className="run-inspector" aria-labelledby="selected-run-title">
    <div className="inspector-heading"><div className="inspector-identity"><span className="eyebrow">SELECTED RUN · {runKey}</span>{editing ? <div className="rename-form"><label htmlFor="run-display-name">Run name</label><div><input id="run-display-name" name="run-display-name" autoComplete="off" maxLength={48} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveName(); if (event.key === "Escape") setEditing(false); }} autoFocus /><button type="button" className="secondary small" disabled={saving} onClick={saveName}>{saving ? "Saving…" : "Save"}</button><button type="button" className="text-button" onClick={() => { setEditing(false); setName(runDisplayName(run)); }}>Cancel</button></div>{renameError && <small role="alert">{renameError}</small>}</div> : <h3 id="selected-run-title">{runDisplayName(run)} <button type="button" className="rename-button" aria-label={`Rename ${runDisplayName(run)}`} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /></button></h3>}<p>{formatForecastLabel(run.scenario_name)} · {run.market.product_minutes} min · {formatRunTime(run.created_at_utc)} · <span translate="no">{shortId(run.simulation_id)}</span></p><p>{money(run.summary.expected_contribution_eur)} · {run.orders.length} orders · {run.audit.modified_by_trader ? "Trader revised" : "Optimizer proposal"}</p></div>{run.simulation_id !== reference.simulation_id && <button type="button" className="secondary small" onClick={setReference}>Use as Reference</button>}</div>
    {run.simulation_id === reference.simulation_id ? <p className="reference-note"><Check size={15} aria-hidden="true" /> This run is the comparison reference.</p> : <div className="configuration-diff">
      <div className="diff-heading"><strong>Changed From Reference</strong><span>{differences.length} changed {differences.length === 1 ? "input" : "inputs"}</span></div>
      {differences.length ? <dl>{differences.map((item) => <div key={item.key}><dt>{item.label}</dt><dd><span>{item.before}</span><b aria-hidden="true">→</b><strong>{item.value}</strong></dd></div>)}</dl> : <p>No configuration differences. These runs share the same recorded inputs.</p>}
    </div>}
    <button type="button" className="text-button configuration-toggle" aria-expanded={showUnchanged} onClick={() => setShowUnchanged(!showUnchanged)}>{showUnchanged ? "Hide Full Configuration" : `Show Full Configuration · ${configurationItems(run).length} Values`}</button>
    {showUnchanged && <div className="configuration-groups">{groups.map((group) => <details key={group}><summary>{group}</summary><dl>{configurationItems(run).filter((item) => item.group === group).map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></details>)}</div>}
  </section>;
}

const metricValue = (run: Simulation, metric: ComparisonMetric) => metric === "contribution" ? run.risk?.expected_contribution_eur ?? run.summary.expected_contribution_eur : metric === "throughput" ? run.summary.throughput_mwh : metric === "cycles" ? run.summary.equivalent_cycles : run.summary.order_count;
const outcomeValue = (run: Simulation, name: "Downside" | "Expected" | "Upside") => run.risk?.outcomes.find((outcome) => outcome.name === name)?.contribution_eur ?? (name === "Downside" ? run.risk?.downside_contribution_eur : name === "Upside" ? run.risk?.upside_contribution_eur : run.summary.expected_contribution_eur) ?? run.summary.expected_contribution_eur;
const outcomeLegend = (value: string) => ({ lowerPrice: "Lower-price outcome", centralPrice: "Central-price outcome", higherPrice: "Higher-price outcome" }[value] ?? words(value));
const probabilityLabel = (run: Simulation) => {
  const probabilities = run.scenario_probabilities ?? { downside: .2, expected: .6, upside: .2 };
  return `Weights: ${number(probabilities.downside * 100, 0)}% lower · ${number(probabilities.expected * 100, 0)}% central · ${number(probabilities.upside * 100, 0)}% higher`;
};
const formatMetric = (value: number, metric: ComparisonMetric) => metric === "contribution" ? money(value) : `${number(value, metric === "cycles" ? 2 : 1)}${metric === "throughput" ? " MWh" : metric === "cycles" ? " EFC" : ""}`;
const signedMetric = (value: number, metric: ComparisonMetric) => Math.abs(value) < 1e-9 ? "–" : `${value > 0 ? "+" : "−"}${formatMetric(Math.abs(value), metric)}`;
const formatRunTime = (value: string) => new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(value));
const axisMoney = (value: number) => `${value < 0 ? "−" : ""}€${Math.abs(value) >= 1000 ? `${number(Math.abs(value) / 1000, 1)}k` : number(Math.abs(value), 0)}`;
