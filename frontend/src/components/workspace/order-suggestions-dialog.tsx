"use client";
import type { SubmittedOrder } from "@/types/api";
import { deliveryTime } from "@/lib/time-presentation";
import { Dialog, DialogActions, useDialogCloseGuard } from "./dialog";
import { useDisplayTimezone } from "./time-preference";
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
  const zone = useDisplayTimezone();
  const money = (value: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(value);
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
          <div className="suggestion-table-scroll">
            <table className="suggestion-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Delivery</th>
                  <th>Side</th>
                  <th>Volume MW</th>
                  <th>Limit €/MWh</th>
                </tr>
              </thead>
              <tbody>
                {state.preview.orders.map((order) => (
                  <tr key={order.client_order_id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${order.side} ${deliveryTime(order.delivery_start_utc, draft.market.product_minutes, zone)}`}
                        checked={state.selected.includes(order.client_order_id)}
                        disabled={state.applying || state.stale}
                        onChange={(e) =>
                          state.setSelected(
                            e.target.checked
                              ? [...state.selected, order.client_order_id]
                              : state.selected.filter((id) => id !== order.client_order_id),
                          )
                        }
                      />
                    </td>
                    <td>
                      {deliveryTime(order.delivery_start_utc, draft.market.product_minutes, zone)}
                    </td>
                    <td>{order.side}</td>
                    <td>{order.volume_mw.toFixed(2)}</td>
                    <td>{order.limit_price_eur_mwh?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="suggestion-summary" aria-live="polite">
            {!state.result ? (
              <p>Checking selected orders…</p>
            ) : (
              <>
                <strong>
                  {state.result.feasible
                    ? "Combined portfolio is feasible"
                    : "Selection needs attention"}
                </strong>
                {state.result.issues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
                {state.result.feasible && (
                  <p>
                    Combined contribution <strong>{money(state.result.contribution_eur)}</strong>
                    {state.result.improvement_eur !== null
                      ? ` · Change ${money(state.result.improvement_eur)}`
                      : " · Additions restore baseline feasibility"}
                  </p>
                )}
              </>
            )}
          </section>
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
