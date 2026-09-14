"use client";
import { useEffect, useRef } from "react";
import { DialogActions, useDialogCloseGuard } from "./dialog";
import type { Draft } from "./workspace-types";
import type { SubmittedOrder } from "@/types/api";
import { usePortfolioRepair } from "./use-portfolio-repair";
import { fromOrders } from "./workspace-adapters";
import { replaceable, type RevisionRow } from "./suggestion-revision";
import { SuggestionRevisionTable } from "./suggestion-revision-table";
import { deliveryLabel, orderNumber } from "./order-presentation";
import { useDisplayTimezone } from "./time-preference";

export function PortfolioRepairPanel({
  draft,
  apply,
  close,
}: {
  draft: Draft;
  apply: (orders: SubmittedOrder[]) => void;
  close: () => void;
}) {
  const state = usePortfolioRepair(draft);
  const permissionsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (state.preview?.status === "blocked" && permissionsRef.current)
      permissionsRef.current.open = true;
  }, [state.preview]);
  const zone = useDisplayTimezone();
  useDialogCloseGuard(() => !state.busy);
  const next = fromOrders(state.preview?.orders ?? [], draft.points);
  const rows: RevisionRow[] =
    state.preview?.status === "ready"
      ? [
          ...draft.orders.map((before): RevisionRow => {
            const after = next.find((o) => o.id === before.id);
            return {
              before,
              after,
              change: !after ? "Removed" : after.volume === before.volume ? "Unchanged" : "Updated",
            };
          }),
          ...next
            .filter((o) => !draft.orders.some((old) => old.id === o.id))
            .map((after): RevisionRow => ({ after, change: "Added" })),
        ]
      : [];
  const label = (o: Draft["orders"][number]) =>
    `${deliveryLabel(draft.points[o.interval].timestamp_utc, draft.market.product_minutes, zone)} · ${o.side} · ${orderNumber(o.volume)} MW`;
  return (
    <section aria-label="Repair portfolio">
      <p>
        Find a feasible schedule with minimal changes. Manual and protected orders stay unchanged
        unless you allow revision.
      </p>
      <details className="revision-protected" ref={permissionsRef}>
        <summary>Review protected orders</summary>
        <p className="ws-help">
          Permission applies to this preview only. These are review candidates, not a proven minimal
          conflict set.
        </p>
        {draft.orders
          .filter((o) => !replaceable(o))
          .map((o) => (
            <label className="repair-option" key={o.id}>
              <input
                type="checkbox"
                disabled={state.busy || state.stale}
                checked={state.allowed.includes(o.id)}
                onChange={(e) => state.allow(o.id, e.target.checked)}
              />
              Allow revision · {label(o)}
            </label>
          ))}
      </details>
      <label className="repair-option">
        <input
          type="checkbox"
          checked={state.additions}
          disabled={state.busy || state.stale}
          onChange={(e) => state.add(e.target.checked)}
        />
        Allow balancing additions
      </label>
      {!!state.kept.length && (
        <details className="revision-protected">
          <summary>Kept original · {state.kept.length}</summary>
          {draft.orders
            .filter((o) => state.kept.includes(o.id))
            .map((o) => (
              <label key={o.id} className="repair-option">
                <input
                  type="checkbox"
                  checked
                  disabled={state.busy}
                  onChange={() => state.keep(o.id, false)}
                />
                {label(o)}
              </label>
            ))}
        </details>
      )}
      {state.stale && <p role="alert">Inputs changed. Close and reopen this preview.</p>}
      {state.error && (
        <p role="alert" className="ws-error">
          {state.error}
        </p>
      )}
      {state.preview && <p role="status">{state.preview.message}</p>}
      {!!state.preview?.issues.length && (
        <details className="revision-protected">
          <summary>
            {state.preview.status === "ready" ? "Issues addressed" : "Schedule issues"} ·{" "}
            {state.preview.issues.length}
          </summary>
          <ul>
            {state.preview.issues.map((issue, i) => (
              <li key={i}>
                {issue.message}
                {issue.existing_orders.length > 0 &&
                  ` (${issue.existing_orders.length} orders in this interval)`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!rows.length && (
        <SuggestionRevisionTable
          draft={draft}
          rows={rows}
          repair
          disabled={state.busy || state.stale}
          reasons={Object.fromEntries(
            (state.preview?.issues ?? []).flatMap((i) =>
              i.existing_orders.map((o) => [
                o.client_order_id,
                `Reported: ${i.code.replaceAll("_", " ")}`,
              ]),
            ),
          )}
          onKeep={(id) => state.keep(id, true)}
        />
      )}
      <DialogActions>
        <button className="secondary" disabled={state.busy} onClick={close}>
          Cancel
        </button>
        <button
          className="secondary"
          disabled={state.busy || state.stale}
          onClick={() => void state.calculate()}
        >
          {state.busy ? "Checking…" : "Calculate corrections"}
        </button>
        <button
          className="primary"
          disabled={state.busy || state.stale || state.preview?.status !== "ready"}
          onClick={() => void state.apply(apply)}
        >
          Apply corrections
        </button>
      </DialogActions>
    </section>
  );
}
