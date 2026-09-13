"use client";

import { type DraftOrderInput } from "@/lib/order-simulation-validation";
import { Plus, RotateCcw, X } from "lucide-react";
import { OrderRow } from "./order-entry-row";

import type { ReadyWorkbench } from "./use-workbench";
import { id } from "./workspace-adapters";
import { clock } from "./workspace-format";
/** Presentation only: all shared state remains in the workbench controller. */
export function OrdersView({
  context,
}: {
  context: Pick<
    ReadyWorkbench,
    | "draft"
    | "result"
    | "view"
    | "selected"
    | "setSelected"
    | "busy"
    | "setModal"
    | "setPreview"
    | "setUndo"
    | "setConfirmation"
    | "dirty"
    | "change"
    | "orderIssues"
    | "loadExample"
  >;
}) {
  const {
    draft,
    result,
    view,
    selected,
    setSelected,
    busy,
    setModal,
    setPreview,
    setUndo,
    setConfirmation,
    dirty,
    change,
    orderIssues,
    loadExample,
  } = context;
  const current = draft.orders.find((o) => o.id === selected);
  return (
    view === "orders" && (
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
          <div className={`ws-order-layout ${current ? "editing" : ""}`}>
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
                      <tr key={o.id} className={selected === o.id ? "selected" : ""}>
                        <td>
                          <button
                            className="ws-row-link"
                            aria-label={`Edit ${clock(draft.points[o.interval].timestamp_utc, draft.market.timezone)} ${o.side} order`}
                            onClick={() => setSelected(o.id)}
                          >
                            {clock(draft.points[o.interval].timestamp_utc, draft.market.timezone)}–
                            {clock(
                              new Date(
                                Date.parse(draft.points[o.interval].timestamp_utc) +
                                  draft.market.product_minutes * 60000,
                              ).toISOString(),
                              draft.market.timezone,
                            )}
                          </button>
                        </td>
                        <td>
                          <span className={`side ${o.side.toLowerCase()}`}>{o.side}</span>
                        </td>
                        <td>{o.orderType === "MARKET" ? "Market" : "Limit"}</td>
                        <td>{o.volume || "—"}</td>
                        <td>
                          {o.orderType === "MARKET" ? "No limit" : o.limit || "—"}
                          {Object.keys(orderIssues).some((k) => k.startsWith(`order.${o.id}.`)) && (
                            <span className="field-error">Check input</span>
                          )}
                        </td>
                        <td>
                          {!result
                            ? "Not simulated"
                            : dirty
                              ? "Re-simulate"
                              : (() => {
                                  const outcome = result.order_results.find(
                                    (item) => item.submitted_order.client_order_id === o.id,
                                  );
                                  return outcome
                                    ? outcome.execution_status === "EXECUTED"
                                      ? "Simulated execution"
                                      : outcome.execution_status === "NOT_EXECUTED"
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
                <p className="ws-empty">No orders yet. Add an order or generate a proposal.</p>
              )}
            </div>
            {current && (
              <aside className="ws-order-editor">
                <div className="ws-section-head">
                  <h3>
                    {current.side} ·{" "}
                    {draft.points[current.interval]
                      ? clock(draft.points[current.interval].timestamp_utc, draft.market.timezone)
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
                      orders: draft.orders.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
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
                  Physical feasibility is checked when simulated. Changes update the draft;
                  re-simulate to update results.
                </p>
              </aside>
            )}
          </div>
          <p className="ws-help">
            Generate proposal suggests orders. Simulate evaluates your entered orders. Same-interval
            eligible orders execute as a batch; no partial fills.
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
    )
  );
}
