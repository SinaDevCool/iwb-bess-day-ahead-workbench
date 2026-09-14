"use client";
import { intervalEvidence } from "@/lib/interval-evidence";
import type { OrderSimulation, Simulation } from "@/types/api";
import { Columns3 } from "lucide-react";
import { useRef, useState } from "react";
import { alignment, choices, clock, defaults, n, type Column } from "./interval-table/columns";
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
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [expansion, setExpansion] = useState<{ id?: string; anchor?: string; run: string }>();
  const expanded =
    expansion &&
    expansion.run === result.simulation_id &&
    (expansion.anchor === selectedId || expansion.id === selectedId)
      ? expansion.id
      : selectedId;
  const toggle = (id: string) => {
    setExpansion({
      id: expanded === id ? undefined : id,
      anchor: selectedId,
      run: result.simulation_id,
    });
    onSelect?.(id);
    if (expanded !== id)
      requestAnimationFrame(() => {
        const bounds = panel.current?.getBoundingClientRect();
        if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight))
          panel.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
      });
  };
  const rows = intervalEvidence(result);
  const selectedRow = rows.find((row) => row.id === expanded);
  const leading = columns.filter((c) => c === "forecast" || c === "action");
  const trailing = columns.filter((c) => c !== "forecast" && c !== "action");
  return (
    <section className="interval-results" aria-labelledby="interval-results-title">
      <div className="interval-table-heading">
        <div>
          <h3 id="interval-results-title">Battery schedule &amp; order outcomes</h3>
          <p>One row per interval. Select any row to inspect its schedule and order evidence.</p>
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
                <th className={alignment(c)} key={c}>
                  {choices[c]}
                </th>
              ))}
              <th>Orders</th>
              {trailing.map((c) => (
                <th className={alignment(c)} key={c}>
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
                <tr
                  key={row.id}
                  className={expanded === row.id ? "selected interval-row" : "interval-row"}
                  onClick={(event) => {
                    if (
                      !window.getSelection()?.toString() &&
                      !(event.target as Element).closest("button, a, input, select")
                    ) {
                      opener.current = event.currentTarget.querySelector("button");
                      toggle(row.id);
                    }
                  }}
                >
                  <td>
                    <button
                      className="ws-row-link"
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        toggle(row.id);
                      }}
                      aria-expanded={expanded === row.id}
                      aria-controls="selected-interval-details"
                    >
                      {clock(row.timestamp_utc, zone)}
                    </button>
                  </td>
                  {leading.map((c) => (
                    <td key={c} className={alignment(c)}>
                      {values[c]}
                    </td>
                  ))}
                  <td>
                    {row.orders.length ? (
                      <button
                        className="ws-row-link"
                        aria-expanded={expanded === row.id}
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          toggle(row.id);
                        }}
                      >
                        {row.orders.length === 1
                          ? `${row.orders[0].submitted_order.side} ${row.orders[0].submitted_order.order_type}`
                          : `${row.orders.length} orders`}
                        <small>
                          {row.orders.filter((o) => o.execution_status === "EXECUTED").length}{" "}
                          executed
                        </small>
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  {trailing.map((c) => (
                    <td
                      key={c}
                      className={`${alignment(c)} ${c === "net" && row.interval_pnl_eur !== 0 ? (row.interval_pnl_eur < 0 ? "negative" : "positive") : ""}`}
                    >
                      {values[c]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div id="selected-interval-details" ref={panel}>
        {selectedRow && (
          <IntervalOrderDetails
            row={selectedRow}
            onEditOrder={onEditOrder}
            onClose={() => {
              toggle(selectedRow.id);
              opener.current?.focus({ preventScroll: true });
            }}
          />
        )}
      </div>
      <p className="interval-table-note">
        Quantities and contribution reconcile to this saved result.
      </p>
    </section>
  );
}
