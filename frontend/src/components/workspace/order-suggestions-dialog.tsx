"use client";
import type { SubmittedOrder } from "@/types/api";
import { OrderSuggestionsTable } from "./order-suggestions-table";
import { SuggestionSummary } from "./suggestion-summary";
import { Dialog, DialogActions, useDialogCloseGuard } from "./dialog";
import { useOrderSuggestions } from "./use-order-suggestions";
import type { Draft } from "./workspace-types";
import { fromOrders } from "./workspace-adapters";
import { replaceable, revisionRows } from "./suggestion-revision";
import { SuggestionRevisionTable } from "./suggestion-revision-table";

function CloseGuard({ busy }: { busy: boolean }) {
  useDialogCloseGuard(() => !busy);
  return null;
}

/** Optional review, not another order workspace. The existing list changes only on acceptance. */
export function OrderSuggestionsDialog({
  draft,
  close,
  add,
  replacing = false,
  reviewProtected,
}: {
  draft: Draft;
  close: () => void;
  add: (orders: SubmittedOrder[]) => void;
  replacing?: boolean;
  reviewProtected?: () => void;
}) {
  const state = useOrderSuggestions(draft, replacing);
  const busy = state.applying || state.rebalancing;
  const rows = state.preview
    ? revisionRows(draft.orders.filter(replaceable), fromOrders(state.preview.orders, draft.points))
    : [];
  const changed = rows.some((row) => row.change !== "Unchanged");
  return (
    <Dialog
      title={replacing ? "Review revised suggestions" : "Suggested additional orders"}
      close={close}
      wide
    >
      <CloseGuard busy={busy} />
      <p>
        {replacing
          ? "Your manual and protected orders stay unchanged. Applying replaces the previous unlocked suggestions as one set."
          : "Your existing orders stay unchanged. Select the additions you want to include."}
      </p>
      <p className="ws-help">
        Limit suggestions use the entered forecast and battery constraints. Actual auction execution
        is not guaranteed.
      </p>
      {state.generating && (
        <p role="status">
          {replacing ? "Re-optimizing suggestions with MILP…" : "Calculating additions with MILP…"}
        </p>
      )}
      {state.error && (
        <p role="alert" className="ws-error">
          {state.error}
        </p>
      )}
      {state.stale && (
        <p role="alert">Inputs changed. Close this preview and generate new suggestions.</p>
      )}
      {state.error && reviewProtected && (
        <button className="secondary small" onClick={reviewProtected} disabled={state.applying}>
          Review protected orders
        </button>
      )}
      {state.error && !state.stale && (
        <button
          className="secondary small"
          onClick={state.retry}
          disabled={state.generating || state.applying}
        >
          Retry calculation
        </button>
      )}
      {replacing && state.preview && <SuggestionRevisionTable draft={draft} rows={rows} />}
      {!replacing && state.preview && !state.preview.orders.length && (
        <p role="status">No useful additional orders found for this case.</p>
      )}
      {!replacing && !!state.preview?.orders.length && (
        <>
          <div className="suggestion-toolbar">
            <strong>
              {state.selected.length} of {state.preview.orders.length} selected
            </strong>
            <button
              className="secondary small"
              disabled={busy || state.stale}
              onClick={() => state.setSelected(state.preview!.orders.map((o) => o.client_order_id))}
            >
              Select all
            </button>
            <button
              className="secondary small"
              disabled={busy || state.stale}
              onClick={() => state.setSelected([])}
            >
              Clear selection
            </button>
          </div>
          <OrderSuggestionsTable
            orders={state.preview.orders}
            selected={state.selected}
            result={state.result}
            minutes={draft.market.product_minutes}
            disabled={busy || state.stale}
            stale={state.stale}
            failed={!!state.error}
            change={state.setSelected}
          />
          <SuggestionSummary
            result={state.result}
            minutes={draft.market.product_minutes}
            stale={state.stale}
            failed={!!state.error}
          />
          {!!state.adjustments.length && (
            <p role="status">
              Rebalanced quantities: {state.adjustments.join("; ")}. Review the updated rows before
              adding. Zero-volume orders are deselected.
            </p>
          )}
          {state.result && !state.result.feasible && (
            <p className="ws-help">
              Removing a charge or discharge can unbalance later intervals. Rebalance selection
              adjusts only selected quantities; existing and unchecked orders stay unchanged.
            </p>
          )}
        </>
      )}
      <DialogActions>
        <button className="secondary" onClick={close} disabled={busy}>
          Cancel
        </button>
        {!replacing && !!state.preview?.orders.length && (
          <button
            className="secondary"
            disabled={busy || state.stale || !state.selected.length}
            onClick={() => void state.rebalance()}
          >
            {state.rebalancing ? "Rebalancing…" : "Rebalance selection"}
          </button>
        )}
        <button
          className="primary"
          disabled={
            state.generating ||
            busy ||
            state.stale ||
            !!state.error ||
            (replacing ? !changed : !state.selected.length) ||
            !state.result?.feasible
          }
          onClick={() => void state.accept(add)}
        >
          {state.applying
            ? "Checking…"
            : replacing
              ? "Apply revised suggestions"
              : "Add selected orders"}
        </button>
      </DialogActions>
    </Dialog>
  );
}
