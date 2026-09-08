"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
type Event = {
  event_id: number;
  simulation_id: string;
  created_at: string;
  event_type: string;
  payload: Record<string, unknown>;
};
export default function AuditPage() {
  const [events, setEvents] = useState<Event[]>([]),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("ALL"),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ items: Event[] }>("/api/audit")
      .then((x) => setEvents(x.items))
      .finally(() => setLoading(false));
  }, []);
  const kinds = useMemo(
    () => [...new Set(events.map((x) => x.event_type))],
    [events],
  );
  const filtered = events.filter(
    (x) =>
      (kind === "ALL" || x.event_type === kind) &&
      (x.simulation_id.toLowerCase().includes(query.toLowerCase()) ||
        x.event_type.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <>
      <a className="skip-link" href="#audit">
        Skip to Audit Events
      </a>
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="logo">IWB</span>
          <span className="brand-copy">
            <strong>Decision Log</strong>
            <span>Simulation, validation and approval evidence</span>
          </span>
        </Link>
        <Link className="header-action" href="/">
          <ArrowLeft size={16} aria-hidden="true" /> Back to Workbench
        </Link>
      </header>
      <div className="safety">
        <ShieldCheck size={16} aria-hidden="true" />
        <strong>GOVERNANCE RECORD</strong>
        <span>
          Every event links to a simulation; no event represents a live market
          submission.
        </span>
      </div>
      <main id="audit" className="audit-page">
        <span className="eyebrow" style={{ color: "#087d78" }}>
          DECISION GOVERNANCE
        </span>
        <h1>Decision History</h1>
        <p>
          Trace simulations, trader changes, validations, approvals and exports.
        </p>
        <div className="audit-tools">
          <label className="sr-only" htmlFor="audit-search">
            Search events
          </label>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: 12,
                color: "#617a77",
              }}
            />
            <input
              id="audit-search"
              name="audit-search"
              autoComplete="off"
              style={{ width: "100%", paddingLeft: 36 }}
              placeholder="Search simulation or event…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="sr-only" htmlFor="event-type">
            Event type
          </label>
          <select
            id="event-type"
            name="event-type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="ALL">All event types</option>
            {kinds.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="state-block">
            <strong>Loading decision evidence…</strong>
          </div>
        ) : !filtered.length ? (
          <div className="state-block">
            <strong>No matching events</strong>
            <span>Change the search or event filter.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Audit events</caption>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Time (UTC)</th>
                  <th>Simulation</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.event_id}>
                    <td>
                      <span
                        className={
                          "event-tag " +
                          (String(x.payload.validation_status) === "failed"
                            ? "failed"
                            : "")
                        }
                      >
                        {title(x.event_type)}
                      </span>
                    </td>
                    <td>{utc(x.created_at)}</td>
                    <td>
                      <code>{x.simulation_id}</code>
                    </td>
                    <td>
                      <details>
                        <summary>{summary(x)}</summary>
                        <code>{JSON.stringify(x.payload, null, 2)}</code>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          {filtered.length} of {events.length} events shown
        </p>
      </main>
    </>
  );
}
const title = (v: string) =>
  v
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
const utc = (v: string) =>
  new Intl.DateTimeFormat("en-CH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(v));
function summary(e: Event) {
  if (e.event_type === "SIMULATION_CREATED")
    return "Validation " + String(e.payload.validation) + " · view evidence";
  if (e.event_type === "ORDER_PROPOSAL_EDITED")
    return (
      String(Array.isArray(e.payload.changes) ? e.payload.changes.length : 0) +
      " trader changes · validation " +
      String(e.payload.validation_status)
    );
  if (e.event_type === "ORDER_PROPOSAL_APPROVED")
    return "Approved for demo export · not submitted";
  if (e.event_type === "ORDER_PROPOSAL_EXPORTED") return "CSV export generated";
  return "View technical evidence";
}
