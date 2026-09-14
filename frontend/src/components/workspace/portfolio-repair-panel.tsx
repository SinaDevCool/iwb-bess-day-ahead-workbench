"use client";
import { DialogActions, useDialogCloseGuard } from "./dialog";
import type { Draft } from "./workspace-types";
import type { SubmittedOrder } from "@/types/api";
import { usePortfolioRepair } from "./use-portfolio-repair";
import { fromOrders } from "./workspace-adapters";
import { replaceable, type RevisionRow } from "./suggestion-revision";
import { SuggestionRevisionTable } from "./suggestion-revision-table";
import { deliveryLabel, orderNumber } from "./order-presentation";
import { useDisplayTimezone } from "./time-preference";
import { repairIssueText, repairReason } from "./repair-presentation";

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
  const zone = useDisplayTimezone();
  useDialogCloseGuard(() => !state.busy);
  // Candidate orders are repaired; diagnostics still describe the original portfolio.
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
  // Required means individually proven; group involvement does not blame every
  // member. Other protected orders can still enable a different full-day repair.
  const required = new Set(state.issues.flatMap((i) => i.required_revision_ids ?? []));
  const involved = new Set(
    state.issues.flatMap((i) => i.existing_orders.map((o) => o.client_order_id)),
  );
  const protectedOrders = draft.orders.filter((o) => !replaceable(o) || state.kept.includes(o.id));
  const necessary = protectedOrders.filter((o) => required.has(o.id));
  const review = protectedOrders.filter((o) => !required.has(o.id) && involved.has(o.id));
  const other = protectedOrders.filter((o) => !required.has(o.id) && !involved.has(o.id));
  const blocker = necessary.find((o) => !state.allowed.includes(o.id) || state.kept.includes(o.id));
  const permission = (o: Draft["orders"][number]) => (
    <div key={o.id}>
      <label className="repair-option">
        <input
          type="checkbox"
          disabled={state.busy || state.stale}
          checked={state.allowed.includes(o.id) && !state.kept.includes(o.id)}
          onChange={(e) => state.allow(o.id, e.target.checked)}
        />
        Allow revision · {label(o)}
      </label>
      {required.has(o.id) && (
        <p className="ws-help">
          {state.issues
            .filter((i) => i.required_revision_ids?.includes(o.id))
            .map(repairIssueText)
            .join(" ")}
        </p>
      )}
      {state.kept.includes(o.id) && (
        <div className="repair-option">
          <span className="ws-help">
            Kept original. This order cannot change and may prevent a repair.
          </span>
          <button
            className="secondary small"
            disabled={state.busy || state.stale}
            onClick={() => state.allow(o.id, true)}
          >
            Allow revision again
          </button>
        </div>
      )}
    </div>
  );
  const status = state.stale
    ? "Inputs changed. Close and reopen this preview."
    : state.error
      ? state.error
      : state.busy
        ? "Calculating corrections…"
        : state.preview?.status === "blocked"
          ? blocker
            ? `Allow revision of ${label(blocker)} and calculate again. No feasible repair can keep it unchanged.`
            : "No feasible repair was found with these permissions. Review protected orders involved or battery settings."
          : state.preview
            ? state.preview.message
            : state.permissionsChanged
              ? "Permissions changed. Calculate again."
              : "Calculate corrections to preview a feasible plan before applying.";
  return (
    <section aria-label="Repair portfolio">
      <p>Preview changes before applying.</p>
      <p className="ws-help">
        Checked orders may be reduced or removed. They will not necessarily change.
      </p>
      {!!necessary.length && (
        <section className="revision-protected repair-required" aria-label="Changes required">
          <strong>Changes required</strong>
          {necessary.map(permission)}
        </section>
      )}
      {!!review.length && (
        <details
          className="revision-protected"
          open={review.some((o) => state.kept.includes(o.id))}
        >
          <summary>Review together · {review.length}</summary>
          <p className="ws-help">
            These orders are involved in reported findings. Not every order needs to change.
          </p>
          {review.map(permission)}
        </details>
      )}
      {!!other.length && (
        <details className="revision-protected" open={other.some((o) => state.kept.includes(o.id))}>
          <summary>Other protected orders · {other.length}</summary>
          {other.map(permission)}
        </details>
      )}
      <label className="repair-option">
        <input
          type="checkbox"
          checked={state.additions}
          disabled={state.busy || state.stale}
          onChange={(e) => state.add(e.target.checked)}
        />
        Allow new balancing orders
      </label>
      <p className="ws-help">
        Permits new orders to balance stored energy. Protected orders remain unchanged.
      </p>
      <p
        id="repair-status"
        role={
          state.stale || state.error || state.preview?.status === "blocked" ? "alert" : "status"
        }
      >
        {status}
      </p>
      {!!state.issues.length && (
        <details className="revision-protected">
          <summary>Diagnostic details</summary>
          <p className="ws-help">
            {state.issues.length} reported findings. Findings may share orders or intervals; this is
            not an exhaustive diagnosis of every possible schedule.
          </p>
          <ul>
            {state.issues.map((issue, i) => (
              <li key={i}>
                {repairIssueText(issue)}
                {issue.existing_orders.map((order) => {
                  const existing = draft.orders.find((o) => o.id === order.client_order_id);
                  return existing ? (
                    <div className="ws-help" key={existing.id}>
                      {label(existing)}
                    </div>
                  ) : null;
                })}
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
            draft.orders.map((o) => [o.id, repairReason(state.issues, o.id)]),
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
          {state.busy ? "Calculating…" : "Calculate corrections"}
        </button>
        <button
          className="primary"
          aria-describedby="repair-status"
          disabled={state.busy || state.stale || state.preview?.status !== "ready"}
          onClick={() => void state.apply(apply)}
        >
          Apply corrections
        </button>
      </DialogActions>
    </section>
  );
}
