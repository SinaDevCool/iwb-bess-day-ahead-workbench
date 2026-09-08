"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Simulation } from "@/types/api";

type Event = { event_id: number; simulation_id: string; created_at: string; event_type: string; payload: Record<string, unknown> };

export default function AuditPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [runs, setRuns] = useState<Simulation[]>([]);
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("q") ?? "");
  const [status, setStatus] = useState(() => typeof window === "undefined" ? "ALL" : new URLSearchParams(location.search).get("status") ?? "ALL");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    Promise.all([api<{ items: Event[] }>("/api/audit"), api<{ items: Simulation[] }>("/api/simulations")])
      .then(([audit, simulations]) => { setEvents(audit.items); setRuns(simulations.items); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Decision history could not be loaded"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    if (status !== "ALL") url.searchParams.set("status", status); else url.searchParams.delete("status");
    history.replaceState({}, "", url);
  }, [query, status]);
  const byRun = useMemo(() => {
    const grouped = new Map<string, Event[]>();
    events.forEach((event) => grouped.set(event.simulation_id, [...(grouped.get(event.simulation_id) ?? []), event]));
    return grouped;
  }, [events]);
  const filtered = runs.filter((run) => {
    const q = query.toLowerCase();
    return (status === "ALL" || run.validation.status === status) &&
      (run.simulation_id.toLowerCase().includes(q) || run.scenario_name.toLowerCase().includes(q) || run.delivery_date.includes(q));
  });
  const approved = runs.filter((run) => Boolean(run.approval_status)).length;
  const passed = runs.filter((run) => run.validation.status === "passed").length;
  return <>
    <a className="skip-link" href="#audit">Skip to Decision Runs</a>
    <header className="topbar">
      <Link className="brand" href="/present/"><span className="logo" translate="no">IWB</span><span className="brand-copy"><strong>Decision Log</strong><span>Saved optimization runs &amp; trader actions</span></span></Link>
      <Link className="header-action" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to Workbench</Link>
    </header>
    <div className="safety"><ShieldCheck size={16} aria-hidden="true" /><strong>TRACEABILITY ONLY</strong><span>Records model decisions and human actions; nothing is submitted to a market.</span></div>
    <main id="audit" className="audit-page">
      <section className="audit-intro">
        <div><span className="eyebrow audit-eyebrow">DECISION GOVERNANCE</span><h1>Optimization Run History</h1><p>Each row is one saved optimization. Open the evidence only when you need its model fingerprint and trader-action history.</p></div>
        <div className="audit-summary" aria-label="Run summary"><Stat label="Saved runs" value={runs.length} /><Stat label="Validated" value={passed} /><Stat label="Approved" value={approved} /></div>
      </section>
      <div className="audit-tools">
        <label className="sr-only" htmlFor="audit-search">Search runs</label><div className="audit-search"><Search size={16} aria-hidden="true" /><input id="audit-search" name="audit-search" autoComplete="off" placeholder="Search run, scenario or delivery date…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <label className="sr-only" htmlFor="validation-status">Validation status</label><select id="validation-status" name="validation-status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All validation results</option><option value="passed">Passed</option><option value="warning">Warning</option><option value="failed">Failed</option></select>
      </div>
      {loading ? <div className="state-block"><strong>Loading saved runs…</strong></div> : loadError ? <div className="state-block" role="alert"><strong>Decision history unavailable</strong><span>{loadError}. Check the service and try again.</span></div> : !filtered.length ? <div className="state-block"><strong>{runs.length ? "No matching runs" : "No optimization runs yet"}</strong><span>{runs.length ? "Change the search or validation filter." : "Return to the workbench and run the optimizer to create the first record."}</span></div> :
        <div className="table-scroll"><table><caption className="sr-only">Saved optimization runs and their lifecycle events</caption><thead><tr><th>Run</th><th>Case</th><th>Outcome</th><th>Recorded actions</th><th>Evidence</th></tr></thead><tbody>{filtered.map((run) => {
          const lifecycle = [...(byRun.get(run.simulation_id) ?? [])].reverse();
          return <tr key={run.simulation_id}><td className="run-cell"><strong>{localTime(run.created_at_utc)}</strong><span><code translate="no">{run.simulation_id}</code></span></td><td className="run-cell"><strong>{run.scenario_name}</strong><span>{formatDate(run.delivery_date)} · {run.market.product_minutes}-minute products</span></td><td className="run-outcome"><strong>{money(run.summary.expected_contribution_eur)}</strong><small>{run.orders.length} orders · validation {run.validation.status}</small></td><td><div className="run-events">{lifecycle.map((event) => <span className="event-step" key={event.event_id}>{shortTitle(event.event_type)}</span>)}</div></td><td><details className="evidence"><summary>View Evidence</summary><pre><code>{JSON.stringify({ input_fingerprint: run.audit.input_hash, optimizer: run.optimization.engine, validation: run.validation.status, events: lifecycle.map((event) => ({ time_utc: event.created_at, type: event.event_type, evidence: event.payload })) }, null, 2)}</code></pre></details></td></tr>;
        })}</tbody></table></div>}
      <p className="hint">{filtered.length} of {runs.length} saved runs shown</p>
    </main>
  </>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="audit-stat"><span>{label}</span><strong>{value}</strong></div>; }
const shortTitle = (value: string) => value === "SIMULATION_CREATED" ? "Optimized" : value.replace("ORDER_PROPOSAL_", "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const localTime = (value: string) => new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" }).format(new Date(value));
const formatDate = (value: string) => new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
const money = (value?: number) => typeof value === "number" ? new Intl.NumberFormat("en-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value) : "–";
