"use client";
import { intervalEvidence } from "@/lib/interval-evidence";
import type { OrderSimulation, Simulation } from "@/types/api";
import { Columns3 } from "lucide-react";
import { Fragment, useState } from "react";
import { choices, clock, defaults, n, type Column } from "./interval-table/columns";
import { IntervalOrderDetails } from "./interval-table/order-details";
import { useColumns } from "./interval-table/use-columns";
import { useDisplayTimezone } from "./workspace/time-preference";

export function IntervalResultsTable({
  result,
  selectedId,
  onSelect,
  onEditOrder,
}: {
  result: Simulation | OrderSimulation;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onEditOrder?: (id: string) => void;
}) {
  const { columns, update } = useColumns();
  const zone = useDisplayTimezone();
  const [expanded, setExpanded] = useState<string>();
  const rows = intervalEvidence(result);
  const leading = columns.filter((c) => c === "forecast" || c === "action");
  const trailing = columns.filter((c) => c !== "forecast" && c !== "action");
  return (
    <section className="interval-results" aria-labelledby="interval-results-title">
      <div className="interval-table-heading">
        <div>
          <h3 id="interval-results-title">Battery schedule &amp; order outcomes</h3>
          <p>One row per interval. Expand Orders for execution evidence.</p>
        </div>
        <details className="column-picker">
          <summary>
            <Columns3 size={15} aria-hidden="true" /> Columns · {2 + columns.length}/7
          </summary>
          <div className="column-menu">
            <strong>Choose up to 5 value columns</strong>
            <span>Delivery and Orders stay visible. Deselect a column to replace it.</span>
            {(Object.keys(choices) as Column[]).map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={columns.includes(c)}
                  disabled={!columns.includes(c) && columns.length === 5}
                  onChange={() =>
                    update(columns.includes(c) ? columns.filter((x) => x !== c) : [...columns, c])
                  }
                />
                {choices[c]}
              </label>
            ))}
            <button className="secondary" onClick={() => update(defaults)}>
              Reset recommended columns
            </button>
          </div>
        </details>
      </div>
      <div className="table-scroll interval-table-scroll">
        <table className="interval-results-table">
          <caption className="sr-only">Saved schedule and simulated order outcomes</caption>
          <thead>
            <tr>
              <th>Delivery</th>
              {leading.map((c) => (
                <th key={c}>{choices[c]}</th>
              ))}
              <th>Orders</th>
              {trailing.map((c) => (
                <th className="numeric" key={c}>
                  {choices[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values: Record<Column, string> = {
                forecast: n(row.price_eur_mwh),
                action: row.action,
                power: n(row.power_mw, 1),
                soc: n(row.soc_mwh),
                net: n(row.interval_pnl_eur),
                energy: n(row.grid_energy_mwh),
                revenue: n(row.sales_revenue_eur),
                purchases: n(row.purchase_cost_eur),
                fees: n(row.transaction_fee_eur),
                degradation: n(row.degradation_cost_eur),
              };
              return (
                <Fragment key={row.id}>
                  <tr className={selectedId === row.id ? "selected" : ""}>
                    <td>
                      <button className="ws-row-link" onClick={() => onSelect?.(row.id)}>
                        {clock(row.timestamp_utc, zone)}
                      </button>
                    </td>
                    {leading.map((c) => (
                      <td key={c} className={c === "forecast" ? "numeric" : ""}>
                        {values[c]}
                      </td>
                    ))}
                    <td>
                      {row.orders.length ? (
                        <button
                          className="ws-row-link"
                          aria-expanded={expanded === row.id}
                          onClick={() => {
                            setExpanded(expanded === row.id ? undefined : row.id);
                            onSelect?.(row.id);
                          }}
                        >
                          {row.orders.length === 1
                            ? `${row.orders[0].submitted_order.side} ${row.orders[0].submitted_order.order_type}`
                            : `${row.orders.length} orders`}
                          <small>
                            {row.orders.filter((o) => o.execution_status === "EXECUTED").length}{" "}
                            executed · {expanded === row.id ? "Hide" : "Details"}
                          </small>
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    {trailing.map((c) => (
                      <td
                        key={c}
                        className={`numeric ${c === "net" ? (row.interval_pnl_eur < 0 ? "negative" : "positive") : ""}`}
                      >
                        {values[c]}
                      </td>
                    ))}
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td colSpan={columns.length + 2}>
                        <IntervalOrderDetails row={row} onEditOrder={onEditOrder} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="interval-table-note">
        Quantities and contribution reconcile to this saved result.
      </p>
    </section>
  );
}
