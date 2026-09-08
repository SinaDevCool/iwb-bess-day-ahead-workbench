"use client";

import { Columns3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, Simulation } from "@/types/api";

type OptionalColumn = "power" | "soc" | "energy" | "revenue" | "purchases" | "degradation" | "fees";

const OPTIONAL_COLUMNS: Array<{ id: OptionalColumn; label: string }> = [
  { id: "power", label: "Power (MW)" },
  { id: "soc", label: "State of charge (MWh)" },
  { id: "energy", label: "Order energy (MWh)" },
  { id: "revenue", label: "Revenue (€)" },
  { id: "purchases", label: "Purchases (€)" },
  { id: "degradation", label: "Degradation (€)" },
  { id: "fees", label: "Transaction fees (€)" },
];
const DEFAULT_COLUMNS: OptionalColumn[] = ["power", "soc"];

const money = (value: number) => new Intl.NumberFormat("en-CH", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
}).format(value);
const number = (value: number, digits = 1) => new Intl.NumberFormat("en-CH", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(value);
const time = (value: string) => new Intl.DateTimeFormat("en-CH", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Zurich",
}).format(new Date(value));

export function IntervalResultsTable({ result }: { result: Simulation }) {
  const [selected, setSelected] = useState<OptionalColumn[]>(DEFAULT_COLUMNS);
  const [maxOptional, setMaxOptional] = useState(2);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const applyWidthLimit = () => {
      const nextMaximum = media.matches ? 1 : 2;
      setMaxOptional(nextMaximum);
      setSelected((current) => current.slice(0, nextMaximum));
    };
    applyWidthLimit();
    media.addEventListener("change", applyWidthLimit);
    return () => media.removeEventListener("change", applyWidthLimit);
  }, []);

  const rows = useMemo(
    () => result.proposal?.implied_dispatch ?? result.dispatch,
    [result],
  );

  const toggleColumn = (column: OptionalColumn) => {
    setSelected((current) => {
      if (current.includes(column)) return current.filter((item) => item !== column);
      return current.length < maxOptional ? [...current, column] : current;
    });
  };

  return (
    <section className="interval-results" aria-labelledby="interval-results-title">
      <div className="interval-table-heading">
        <div>
          <span className="chart-kicker">INTERVAL DETAIL</span>
          <h3 id="interval-results-title">Dispatch &amp; Economics by Delivery Interval</h3>
          <p>One reconciled view of the simulated schedule and generated order economics.</p>
        </div>
        <details className="column-picker">
          <summary aria-label="Choose interval table columns">
            <Columns3 size={15} aria-hidden="true" />
            Columns · {4 + selected.length}/{4 + maxOptional}
          </summary>
          <div className="column-menu">
            <strong>Additional columns</strong>
            <span>Choose up to {maxOptional}. Core decision columns stay visible.</span>
            {OPTIONAL_COLUMNS.map((column) => {
              const checked = selected.includes(column.id);
              return (
                <label className="column-option" key={column.id}>
                  <input
                    type="checkbox"
                    aria-label={column.label}
                    checked={checked}
                    disabled={!checked && selected.length >= maxOptional}
                    onChange={() => toggleColumn(column.id)}
                  />
                  <span>{column.label}</span>
                </label>
              );
            })}
          </div>
        </details>
      </div>
      <div className="table-scroll interval-table-scroll">
        <table className="interval-results-table">
          <caption className="sr-only">Simulated dispatch and auction-order economics by delivery interval</caption>
          <thead>
            <tr>
              <th>Delivery</th>
              <th className="numeric">DA Forecast (€/MWh)</th>
              <th>Action</th>
              {selected.map((column) => <th className="numeric" key={column}>{columnHeading(column)}</th>)}
              <th className="numeric">Net Contribution (€)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.interval}>
                <td>{time(row.timestamp_utc)}</td>
                <td className="numeric">{money(row.price_eur_mwh)}</td>
                <td><span className={`interval-action ${row.action}`}>{row.action}</span></td>
                {selected.map((column) => <td className="numeric" key={column}>{columnValue(column, row)}</td>)}
                <td className={`numeric contribution ${row.interval_pnl_eur < 0 ? "negative" : row.interval_pnl_eur > 0 ? "positive" : ""}`}>
                  {money(row.interval_pnl_eur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="interval-table-note">Delivery time: Europe/Zurich. Values reconcile to the current rounded order proposal.</p>
    </section>
  );
}

function columnHeading(column: OptionalColumn) {
  return OPTIONAL_COLUMNS.find((item) => item.id === column)?.label ?? column;
}

function columnValue(column: OptionalColumn, row: Dispatch) {
  switch (column) {
    case "power": return `${number(row.power_mw)} MW`;
    case "soc": return `${number(row.soc_mwh)} MWh`;
    case "energy": return `${number(row.grid_energy_mwh, 2)} MWh`;
    case "revenue": return money(row.sales_revenue_eur);
    case "purchases": return money(row.purchase_cost_eur);
    case "degradation": return money(row.degradation_cost_eur);
    case "fees": return money(row.transaction_fee_eur);
  }
}
