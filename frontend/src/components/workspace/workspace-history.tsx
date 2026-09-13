"use client";
import { api } from "@/lib/api";
import { runDisplayName } from "@/lib/comparison";
import type { HistoryDetail as Detail, HistoryEntry as Entry } from "@/types/history";
import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryDetailView } from "./history-detail";
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
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Detail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const invalidateRequests = useCallback(() => {
    listRequest.current++;
    detailRequest.current++;
  }, []);
  const [detailTab, setDetailTab] = useState<"Summary" | "Inputs" | "Activity">("Summary");
  const load = useCallback((page: number) => {
    const request = ++listRequest.current;
    setLoading(true);
    setError("");
    api<{ items: Entry[] }>(`/api/workspace-history?offset=${page}&limit=30`)
      .then((r) => {
        if (request === listRequest.current) setItems(r.items);
      })
      .catch((e) => {
        if (request === listRequest.current) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (request === listRequest.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => load(0), 0);
    return () => {
      clearTimeout(timer);
      invalidateRequests();
    };
  }, [load, invalidateRequests]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  return (
    <section className="ws-card">
      <div className="ws-section-head">
        <h2 ref={listHeading} tabIndex={-1}>
          Saved runs
        </h2>
        {!detail && (
          <button
            className="secondary small"
            disabled={loading || detailLoading}
            onClick={() => load(offset)}
          >
            Refresh
          </button>
        )}
      </div>
      <p className="ws-help">
        Simulations restore exact inputs and results. Proposals open in analysis without replacing
        orders.
      </p>
      {error && <p role="alert">{error}</p>}
      {detailLoading && <p role="status">Loading saved record…</p>}
      {!detail &&
        (loading ? (
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
                      <button
                        className="ws-row-link"
                        disabled={detailLoading}
                        onClick={() => {
                          const request = ++detailRequest.current;
                          setDetailLoading(true);
                          setError("");
                          setDetail(undefined);
                          setDetailTab("Summary");
                          api<Detail>(`/api/workspace-history/${r.simulation_id}`)
                            .then((value) => {
                              if (request === detailRequest.current) setDetail(value);
                            })
                            .catch((e) => {
                              if (request === detailRequest.current)
                                setError(e instanceof Error ? e.message : String(e));
                            })
                            .finally(() => {
                              if (request === detailRequest.current) setDetailLoading(false);
                            });
                        }}
                      >
                        {runDisplayName(r)} · View details
                      </button>
                      <small>{new Date(r.created_at_utc).toLocaleString("en-GB")}</small>
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
                    <td>
                      <button
                        disabled={busy || detailLoading}
                        className="ws-row-link"
                        onClick={() => void restore(r.simulation_id, r.run_type)}
                      >
                        {r.run_type === "ORDER_SIMULATION" ? "Restore simulation" : "Open proposal"}
                      </button>
                      <small title={r.source_proposal_id}>Reference: {r.simulation_id}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p>No saved runs yet.</p>}
          </div>
        ))}
      {!detail && (
        <div className="history-pagination">
          <button
            className="secondary"
            disabled={loading || detailLoading || offset === 0}
            onClick={() => {
              setOffset(offset - 30);
              load(offset - 30);
            }}
          >
            Previous
          </button>
          <span>Page {offset / 30 + 1}</span>
          <button
            className="secondary"
            disabled={loading || detailLoading || items.length < 30}
            onClick={() => {
              setOffset(offset + 30);
              load(offset + 30);
            }}
          >
            Next
          </button>
        </div>
      )}
      {detail && (
        <HistoryDetailView
          detail={detail}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          detailHeading={detailHeading}
          onBack={() => {
            setDetail(undefined);
            listHeading.current?.focus();
          }}
        />
      )}
    </section>
  );
}
