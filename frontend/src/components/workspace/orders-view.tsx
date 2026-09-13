"use client";
import { useRef, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { SimulationAssumptions } from "./simulation-verdict";
import { OrderTicket } from "./order-ticket";
import { OrdersTable } from "./orders-table";
import { useOrderLayout } from "./use-order-layout";
import type { ReadyWorkbench } from "./use-workbench";
import { AddOrderDialog } from "./add-order-dialog";

/** Orchestrates selection only; every edit updates the existing shared case draft. */
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
    | "showOrderOnSchedule"
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
    showOrderOnSchedule,
  } = context;
  const openerRef = useRef<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const addOrderRef = useRef<HTMLButtonElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { layoutRef, wide } = useOrderLayout(view);
  const current = draft.orders.find((order) => order.id === selected);
  const ticket = current && (
    <OrderTicket
      order={current}
      rowIndex={draft.orders.indexOf(current)}
      points={draft.points}
      prices={draft.prices}
      market={draft.market}
      issues={orderIssues}
      outcome={result?.order_results.find(
        (outcome) => outcome.submitted_order.client_order_id === current.id,
      )}
      stale={Boolean(result) && dirty}
      close={() => {
        setSelected("");
        (rowRefs.current[selected] ?? openerRef.current)?.focus();
      }}
      locate={() => showOrderOnSchedule(current.id)}
      update={(oid, patch) =>
        change({
          orders: draft.orders.map((order) => (order.id === oid ? { ...order, ...patch } : order)),
        })
      }
      remove={(order) => {
        setUndo(draft);
        change({ orders: draft.orders.filter((item) => item.id !== order.id) });
        setSelected("");
        addOrderRef.current?.focus();
      }}
    />
  );
  return (
    view === "orders" && (
      <>
        {adding && (
          <AddOrderDialog
            points={draft.points}
            prices={draft.prices}
            market={draft.market}
            battery={draft.battery}
            close={() => setAdding(false)}
            add={(order) => {
              setUndo(draft);
              change({ orders: [...draft.orders, order] });
              setAdding(false);
              setSelected(order.id);
            }}
          />
        )}
        <section className="ws-card orders-card">
          <div className="ws-section-head">
            <h2>
              Orders <small>{draft.orders.length}</small>
            </h2>
            <div>
              <button
                ref={addOrderRef}
                className="secondary small"
                disabled={Boolean(busy)}
                onClick={(event) => {
                  openerRef.current = event.currentTarget;
                  setAdding(true);
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Add order
              </button>
              <button
                className="ws-text-button"
                disabled={Boolean(busy)}
                onClick={() => {
                  setPreview(undefined);
                  setModal("proposal");
                }}
              >
                Generate proposal
              </button>
            </div>
          </div>
          <p className="orders-caption">Entered orders · simulated outcomes</p>
          <div ref={layoutRef} className="orders-layout" data-docked={Boolean(wide && current)}>
            <OrdersTable
              draft={draft}
              result={result}
              dirty={dirty}
              selected={selected}
              issues={orderIssues}
              ticket={ticket}
              wide={wide}
              rowRefs={rowRefs}
              select={(oid, opener) => {
                openerRef.current = opener;
                setSelected(oid);
              }}
            />
            {wide && ticket}
          </div>
          <p className="ws-help">
            Generate proposes orders. Simulate evaluates the orders currently entered.
          </p>
          <SimulationAssumptions />
        </section>
        <button
          className="ws-text-button"
          disabled={Boolean(busy)}
          onClick={() =>
            setConfirmation({
              message:
                draft.market.product_minutes === 60
                  ? "Load example prices and orders? Battery settings are preserved. You can undo the replacement."
                  : "Load a demo forecast? Existing orders and battery settings are preserved. You can undo the replacement.",
              action: () => void loadExample(),
            })
          }
        >
          <RotateCcw size={14} aria-hidden="true" />
          {draft.market.product_minutes === 60 ? "Load example inputs" : "Load demo forecast"}
        </button>
      </>
    )
  );
}
