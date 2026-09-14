"use client";
import type { SubmittedOrder } from "@/types/api";
import { OrderSuggestionsTable } from "./order-suggestions-table";
import { SuggestionSummary } from "./suggestion-summary";
import { Dialog, DialogActions, useDialogCloseGuard } from "./dialog";
import { useOrderSuggestions } from "./use-order-suggestions";
import type { Draft } from "./workspace-types";

function CloseGuard({ busy }: { busy: boolean }) {
  useDialogCloseGuard(() => !busy);
  return null;
}

/** Optional review, not another order workspace. The existing list changes only on acceptance. */
export function OrderSuggestionsDialog({
  draft,
  close,
  add,
}: {
  draft: Draft;
  close: () => void;
  add: (orders: SubmittedOrder[]) => void;
}) {
  const state = useOrderSuggestions(draft);
  return (
    <Dialog title="Suggested additional orders" close={close} wide>
      <CloseGuard busy={state.applying} />
      <p>Your existing orders stay unchanged. Select the additions you want to include.</p>
      <p className="ws-help">
        Limit suggestions use the entered forecast and battery constraints. Actual auction execution
        is not guaranteed.
      </p>
      {state.generating && <p role="status">Calculating additions with MILP…</p>}
      {state.error && (
        <p role="alert" className="ws-error">
          {state.error}
        </p>
      )}
      {state.stale && (
        <p role="alert">Inputs changed. Close this preview and generate new suggestions.</p>
      )}
      {state.preview && !state.preview.orders.length && (
        <p role="status">No useful additional orders found for this case.</p>
      )}
      {!!state.preview?.orders.length && (
        <>
          <div className="suggestion-toolbar">
            <strong>
              {state.selected.length} of {state.preview.orders.length} selected
            </strong>
            <button
              className="secondary small"
              disabled={state.applying || state.stale}
              onClick={() => state.setSelected(state.preview!.orders.map((o) => o.client_order_id))}
            >
              Select all
            </button>
            <button
              className="secondary small"
              disabled={state.applying || state.stale}
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
            disabled={state.applying || state.stale}
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
        </>
      )}
      <DialogActions>
        <button className="secondary" onClick={close} disabled={state.applying}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            state.generating ||
            state.applying ||
            state.stale ||
            !!state.error ||
            !state.selected.length ||
            !state.result?.feasible
          }
          onClick={() => void state.accept(add)}
        >
          {state.applying ? "Checking…" : "Add selected orders"}
        </button>
      </DialogActions>
    </Dialog>
  );
}
