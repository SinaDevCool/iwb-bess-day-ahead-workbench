"use client";
import { Fragment, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { SubmittedOrder } from "@/types/api";
import { deliveryTime } from "@/lib/time-presentation";
import { useDisplayTimezone } from "./time-preference";
import { checkLabel, issueText, participants, type SelectionResult } from "./suggestion-checks";

/** Selection belongs to the parent. Only the single expanded explanation is local. */
export function OrderSuggestionsTable({
  orders,
  selected,
  result,
  minutes,
  disabled,
  stale,
  failed,
  change,
}: {
  orders: SubmittedOrder[];
  selected: string[];
  result?: SelectionResult;
  minutes: number;
  disabled: boolean;
  stale: boolean;
  failed: boolean;
  change: (ids: string[]) => void;
}) {
  const zone = useDisplayTimezone();
  const [expanded, setExpanded] = useState<{ id: string; result: SelectionResult }>();
  return (
    <div className="suggestion-table-scroll">
      <table className="suggestion-table">
        <thead>
          <tr>
            <th scope="col">Select</th>
            <th scope="col">Delivery</th>
            <th scope="col">Side</th>
            <th scope="col" className="suggestion-number">
              Volume MW
            </th>
            <th scope="col" className="suggestion-number">
              Limit €/MWh
            </th>
            <th scope="col">Check</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const id = order.client_order_id,
              included = selected.includes(id);
            const check = result?.order_checks?.find((c) => c.order_id === id);
            const issue = included
              ? result?.interval_issues?.find((i) => check?.issue_ids.includes(i.issue_id))
              : undefined;
            const open = issue && expanded?.id === id && expanded.result === result;
            const label = deliveryTime(order.delivery_start_utc, minutes, zone);
            return (
              <Fragment key={id}>
                <tr className={issue ? "suggestion-warning-row" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${order.side} ${label}`}
                      checked={included}
                      disabled={disabled}
                      onChange={(e) =>
                        change(
                          e.target.checked
                            ? [...selected, id]
                            : selected.filter((value) => value !== id),
                        )
                      }
                    />
                  </td>
                  <td>{label}</td>
                  <td>{order.side}</td>
                  <td className="suggestion-number">{order.volume_mw.toFixed(2)}</td>
                  <td className="suggestion-number">{order.limit_price_eur_mwh?.toFixed(2)}</td>
                  <td className="suggestion-check">
                    {!included ? (
                      <span aria-label="Not selected">—</span>
                    ) : stale ? (
                      <span>Recheck</span>
                    ) : failed ? (
                      <span>Unavailable</span>
                    ) : !result ? (
                      <span aria-label="Checking selection">—</span>
                    ) : issue ? (
                      <button
                        className="suggestion-check-button"
                        aria-label={`${checkLabel(issue.code)} at ${label}`}
                        aria-expanded={!!open}
                        aria-controls={`check-${id}`}
                        onClick={() => setExpanded(open ? undefined : { id, result })}
                      >
                        <AlertTriangle size={14} aria-hidden="true" />
                        {checkLabel(issue.code)}
                      </button>
                    ) : check?.after_exclusion ? (
                      <span title="Passes only after earlier infeasible batches were excluded">
                        Recheck
                      </span>
                    ) : check?.execution_status === "EXECUTED" ? (
                      <span aria-label="Fits selected schedule">
                        <Check size={16} aria-hidden="true" />
                      </span>
                    ) : (
                      <span>
                        {check?.execution_status === "NOT_EXECUTED" ? "Price not met" : "Recheck"}
                      </span>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="suggestion-explanation">
                    <td colSpan={6} id={`check-${id}`}>
                      <strong>{issueText(issue)}</strong>
                      <p>{participants(issue, orders)}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
