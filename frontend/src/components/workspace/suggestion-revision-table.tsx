"use client";
import { useState } from "react";
import type { Draft } from "./workspace-types";
import type { RevisionRow } from "./suggestion-revision";
import { revisionBaseline } from "./suggestion-revision";
import { deliveryLabel, orderNumber } from "./order-presentation";
import { useDisplayTimezone } from "./time-preference";
import { repairSummary } from "./repair-presentation";

export function SuggestionRevisionTable({
  draft,
  rows,
  repair = false,
  onKeep,
  disabled = false,
  reasons,
}: {
  draft: Draft;
  rows: RevisionRow[];
  repair?: boolean;
  onKeep?: (id: string) => void;
  disabled?: boolean;
  reasons?: Record<string, string>;
}) {
  const [all, setAll] = useState(false);
  const zone = useDisplayTimezone();
  const protectedOrders = revisionBaseline(draft).orders;
  const changed = rows.filter((r) => r.change !== "Unchanged");
  const pricesChanged =
    !repair &&
    rows.some(
      (r) =>
        !r.before ||
        !r.after ||
        r.before.orderType !== r.after.orderType ||
        Number(r.before.limit) !== Number(r.after.limit),
    );
  const delivery = (interval: number) =>
    deliveryLabel(draft.points[interval].timestamp_utc, draft.market.product_minutes, zone);
  return (
    <section aria-label="Proposed suggestion changes">
      <div className="suggestion-toolbar">
        <strong>
          {repair
            ? repairSummary(rows)
            : `${protectedOrders.length} protected · ${changed.length} changes`}
        </strong>
        <button className="secondary small" aria-pressed={!all} onClick={() => setAll(false)}>
          Changes only
        </button>
        <button className="secondary small" aria-pressed={all} onClick={() => setAll(true)}>
          {repair ? "All orders" : "All suggestions"}
        </button>
      </div>
      {!changed.length && <p role="status">Current suggestions already match this calculation.</p>}
      {(all || changed.length > 0) && (
        <div className="suggestion-table-scroll">
          <table className={`suggestion-table revision-table${repair ? " repair-table" : ""}`}>
            <caption className="sr-only">
              {repair ? "Proposed portfolio corrections" : "Current and proposed suggested orders"}
            </caption>
            <thead>
              <tr>
                <th scope="col">Delivery</th>
                <th scope="col">Side</th>
                <th scope="col" className="suggestion-number">
                  Current MW
                </th>
                <th scope="col" className="suggestion-number">
                  Proposed MW
                </th>
                {pricesChanged && (
                  <>
                    <th scope="col" className="suggestion-number">
                      Current limit €/MWh
                    </th>
                    <th scope="col" className="suggestion-number">
                      Proposed limit €/MWh
                    </th>
                  </>
                )}
                <th scope="col">Change</th>
                {repair && <th scope="col">Review</th>}
              </tr>
            </thead>
            <tbody>
              {(all ? rows : changed).map((r) => {
                const order = (r.after ?? r.before)!;
                const price = (o: typeof r.before) =>
                  !o ? "—" : o.orderType === "MARKET" ? "Market" : orderNumber(o.limit, true);
                return (
                  <tr key={r.before?.id ?? r.after!.id}>
                    <td>{delivery(order.interval)}</td>
                    <td>
                      {order.side === "BUY" ? "Buy" : "Sell"}
                      {repair && (
                        <small>
                          {" "}
                          · {(order.origin ?? "manual") === "manual" ? "Manual" : "Suggested"}
                        </small>
                      )}
                    </td>
                    <td className="suggestion-number">
                      {r.before ? orderNumber(r.before.volume) : "—"}
                    </td>
                    <td className="suggestion-number">
                      {r.after ? orderNumber(r.after.volume) : "—"}
                    </td>
                    {pricesChanged && (
                      <>
                        <td className="suggestion-number">{price(r.before)}</td>
                        <td className="suggestion-number">{price(r.after)}</td>
                      </>
                    )}
                    <td>
                      <span className={`revision-label revision-${r.change.toLowerCase()}`}>
                        {r.change}
                      </span>
                    </td>
                    {repair && (
                      <td>
                        <small>
                          {r.change === "Unchanged"
                            ? "Kept unchanged"
                            : (reasons?.[order.id] ?? "Part of the full-day repair.")}
                        </small>
                        {r.before && r.change !== "Unchanged" && (
                          <button
                            className="secondary small"
                            disabled={disabled}
                            onClick={() => onKeep?.(r.before!.id)}
                          >
                            Keep original
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!repair && !!protectedOrders.length && (
        <details className="revision-protected">
          <summary>
            Kept unchanged · {protectedOrders.length}{" "}
            {protectedOrders.length === 1 ? "order" : "orders"}
          </summary>
          <ul>
            {protectedOrders.map((o) => (
              <li key={o.id}>
                {delivery(o.interval)} · {o.side} · {orderNumber(o.volume)} MW
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
