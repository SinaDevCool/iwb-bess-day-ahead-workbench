"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { runDisplayName } from "@/lib/comparison";
type Entry = {
  simulation_id: string;
  run_type: string;
  created_at_utc: string;
  delivery_date: string;
  validation_status: string;
  contribution_eur: number;
  source_proposal_id?: string;
  display_name?: string;
};
export function WorkspaceHistory({
  restore,
  busy = false,
}: {
  restore: (id: string, kind: string) => Promise<void>;
  busy?: boolean;
}) {
  const [items, setItems] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError("");
    api<{ items: Entry[] }>("/api/workspace-history")
      .then((r) => setItems(r.items))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section className="ws-card">
      <div className="ws-section-head">
        <h2>Saved runs</h2>
        <button className="secondary small" onClick={load}>
          Refresh
        </button>
      </div>
      <p className="ws-help">
        Simulations restore exact inputs and results. Proposals open in analysis
        without replacing orders.
      </p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading history…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Type</th>
                <th>Delivery</th>
                <th>Cash contribution</th>
                <th>Validation</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.simulation_id}>
                  <td>
                    <strong>{runDisplayName(r)}</strong>
                    <small>
                      {new Date(r.created_at_utc).toLocaleString("en-GB")}
                    </small>
                  </td>
                  <td>
                    {r.run_type === "ORDER_SIMULATION"
                      ? "Order simulation"
                      : "Optimization proposal"}
                  </td>
                  <td>{r.delivery_date}</td>
                  <td>
                    {new Intl.NumberFormat("en-CH", {
                      style: "currency",
                      currency: "EUR",
                    }).format(r.contribution_eur)}
                  </td>
                  <td>{r.validation_status.replaceAll("_", " ")}</td>
                  <td><button disabled={busy} className="ws-row-link" onClick={() => void restore(r.simulation_id, r.run_type)}>{r.run_type === "ORDER_SIMULATION" ? "Restore simulation" : "Open proposal"}</button><small title={r.source_proposal_id}>Reference: {r.simulation_id}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p>No saved runs yet.</p>}
        </div>
      )}
    </section>
  );
}
