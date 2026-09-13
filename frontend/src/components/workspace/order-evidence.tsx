"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Columns3, Trash2 } from "lucide-react";
import { DispatchChart } from "@/components/dispatch-chart";
import {
  priceCondition,
  type DraftOrderInput,
} from "@/lib/order-simulation-validation";
import type {
  Market,
  OrderSimulation,
  SimulatedOrderResult,
  SubmittedOrderType,
} from "@/types/api";
type DraftOrder = DraftOrderInput;
type ForecastPoint = { timestamp_utc: string; price_eur_mwh: number };
type OptionalColumn =
  | "entered"
  | "limit"
  | "condition"
  | "energy"
  | "socBefore"
  | "socDelta"
  | "contribution"
  | "reason";
const OPTIONAL_COLUMNS: Array<{ id: OptionalColumn; label: string }> = [
  { id: "entered", label: "Entered volume" },
  { id: "limit", label: "Limit price" },
  { id: "condition", label: "Price condition" },
  { id: "energy", label: "Executed energy" },
  { id: "socBefore", label: "SoC before" },
  { id: "socDelta", label: "SoC change" },
  { id: "contribution", label: "Contribution" },
  { id: "reason", label: "Reason code" },
];
const DEFAULT_COLUMNS: OptionalColumn[] = ["contribution"];
const money = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
const number = (value: number, digits = 1) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(
    value,
  );
const time = (value: string, zone = "Europe/Zurich") =>
  new Intl.DateTimeFormat("en-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(value));
export function OrderRow({
  order,
  rowIndex,
  points,
  prices,
  market,
  issues,
  update,
  remove,
}: {
  order: DraftOrder;
  rowIndex: number;
  points: ForecastPoint[];
  prices: string[];
  market: Market;
  issues: Record<string, string>;
  update: (id: string, patch: Partial<DraftOrder>) => void;
  remove: (order: DraftOrder) => void;
}) {
  const prefix = `order.${order.id}`;
  const forecast = Number(prices[order.interval]);
  const limit = Number(order.limit);
  const preview =
    order.orderType === "LIMIT" &&
    prices[order.interval]?.trim() &&
    order.limit.trim() &&
    Number.isFinite(forecast) &&
    Number.isFinite(limit)
      ? priceCondition(order.side, forecast, limit)
      : undefined;
  return (
    <div className="order-entry-row">
      <span className="row-number">{rowIndex + 1}</span>
      <label className="order-delivery">
        Delivery
        <select
          name={`delivery-${order.id}`}
          aria-label={`Delivery for order ${rowIndex + 1}`}
          aria-invalid={Boolean(issues[`${prefix}.interval`])}
          value={order.interval}
          onChange={(event) =>
            update(order.id, { interval: Number(event.target.value) })
          }
        >
          {points.map((point, index) => (
            <option value={index} key={point.timestamp_utc}>
              {time(point.timestamp_utc, market.timezone)} ·{" "}
              {point.timestamp_utc.slice(11, 16)} UTC
            </option>
          ))}
        </select>
        {issues[`${prefix}.interval`] && (
          <small className="field-error">{issues[`${prefix}.interval`]}</small>
        )}
      </label>
      <label className="order-side">
        Side
        <select
          name={`side-${order.id}`}
          aria-label={`Side for order ${rowIndex + 1}`}
          value={order.side}
          onChange={(event) =>
            update(order.id, { side: event.target.value as "BUY" | "SELL" })
          }
        >
          <option>BUY</option>
          <option>SELL</option>
        </select>
      </label>
      <label className="order-type">
        Type
        <select
          name={`type-${order.id}`}
          aria-label={`Type for order ${rowIndex + 1}`}
          value={order.orderType}
          onChange={(event) =>
            update(order.id, {
              orderType: event.target.value as SubmittedOrderType,
              limit:
                event.target.value === "MARKET"
                  ? ""
                  : order.limit || prices[order.interval] || "",
            })
          }
        >
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
        </select>
      </label>
      <label className="order-volume">
        Volume
        <span className="unit-input">
          <input
            name={`volume-${order.id}`}
            type="number"
            inputMode="decimal"
            autoComplete="off"
            step={market.volume_increment_mw}
            aria-label={`Volume for order ${rowIndex + 1}`}
            aria-invalid={Boolean(issues[`${prefix}.volume`])}
            value={order.volume}
            onChange={(event) =>
              update(order.id, { volume: event.target.value })
            }
          />
          <small>MW</small>
        </span>
        {issues[`${prefix}.volume`] && (
          <small className="field-error">{issues[`${prefix}.volume`]}</small>
        )}
      </label>
      {order.orderType === "LIMIT" ? (
        <label className="order-price">
          {order.side === "BUY" ? "Maximum buy price" : "Minimum sell price"}
          <span className="unit-input">
            <input
              name={`limit-${order.id}`}
              aria-label={`Limit price for order ${rowIndex + 1}`}
              type="number"
              inputMode="decimal"
              autoComplete="off"
              step={market.price_increment_eur_mwh}
              aria-invalid={Boolean(issues[`${prefix}.limit`])}
              value={order.limit}
              onChange={(event) =>
                update(order.id, { limit: event.target.value })
              }
            />
            <small>€/MWh</small>
          </span>
          {issues[`${prefix}.limit`] ? (
            <small className="field-error">{issues[`${prefix}.limit`]}</small>
          ) : (
            preview && (
              <small
                className={`condition-preview ${preview.passed ? "passed" : "rejected"}`}
              >
                {preview.passed ? "Would pass" : "Would not pass"} ·{" "}
                {money(Math.abs(preview.marginEurMwh))}/MWh{" "}
                {preview.marginEurMwh >= 0 ? "inside" : "outside"}
              </small>
            )
          )}
        </label>
      ) : (
        <div className="market-condition">
          <span>Price condition</span>
          <strong>None</strong>
          <small>Market order</small>
        </div>
      )}
      <button
        type="button"
        className="icon-button remove-order"
        aria-label={`Remove order ${rowIndex + 1}`}
        onClick={() => remove(order)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SimulationResults({ result }: { result: OrderSimulation }) {
  const ordered = useMemo(
    () =>
      [...result.order_results].sort((a, b) =>
        a.submitted_order.delivery_start_utc.localeCompare(
          b.submitted_order.delivery_start_utc,
        ),
      ),
    [result],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [columns, setColumns] = useState<OptionalColumn[]>(DEFAULT_COLUMNS);
  const marketPassed = result.order_results.filter(
    (o) =>
      o.submitted_order.order_type === "MARKET" ||
      o.price_condition_passed === true,
  ).length;
  const summary = result.summary.infeasible_order_count
    ? `${result.summary.executed_order_count} of ${result.summary.submitted_order_count} orders executed; ${result.summary.infeasible_order_count} physically infeasible.`
    : result.summary.not_executed_order_count
      ? `${result.summary.executed_order_count} of ${result.summary.submitted_order_count} orders executed; ${result.summary.not_executed_order_count} did not meet the price condition.`
      : `All ${result.summary.executed_order_count} submitted orders executed.`;
  const toggle = (id: OptionalColumn) =>
    setColumns((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );
  return (
    <div className="simulation-results">
      <div
        className={`result-verdict ${result.executed_schedule_feasible ? "passed" : "failed"}`}
      >
        <div>
          {result.executed_schedule_feasible ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <AlertTriangle aria-hidden="true" />
          )}
          <span>
            <strong>{summary}</strong>
            <small>
              The resulting battery schedule is{" "}
              {result.executed_schedule_feasible
                ? "physically feasible"
                : "not physically feasible"}
              .
            </small>
          </span>
        </div>
      </div>
      <div className="ws-validation-line" role="status">
        Submitted portfolio:{" "}
        {result.submitted_portfolio_feasible ? "feasible" : "needs attention"} ·{" "}
        {marketPassed} price-eligible ·{" "}
        {result.summary.not_executed_order_count} price-rejected ·{" "}
        {result.summary.infeasible_order_count} physically rejected.
        {!result.executed_schedule_feasible && (
          <span className="field-error">
            {result.validation.findings.map((f) => f.message).join(" · ")}
          </span>
        )}
      </div>
      <div className="simulation-kpis">
        <Kpi
          label="Net contribution"
          value={new Intl.NumberFormat("en-CH", {
            style: "currency",
            currency: "EUR",
          }).format(result.summary.net_contribution_eur)}
          detail="SELL revenue − BUY purchases − costs"
        />
        <Kpi
          label="Executed orders"
          value={`${result.summary.executed_order_count}/${result.summary.submitted_order_count}`}
          detail={`${result.summary.not_executed_order_count} price-rejected`}
        />
        <Kpi
          label="Final SoC"
          value={`${number(result.summary.final_soc_mwh)} MWh`}
          detail={`started at ${number(result.summary.initial_soc_mwh)} MWh`}
        />
      </div>
      <div className="simulator-card">
        <DispatchChart
          rows={result.dispatch}
          battery={result.battery}
          forecast={result.forecast}
          mode="order-simulation"
          executedOrderCount={result.summary.executed_order_count}
          submittedOrderCount={result.summary.submitted_order_count}
          orderResults={ordered}
          selectedOrderId={selectedId}
          onSelectOrder={setSelectedId}
        />
      </div>
      <details className="ws-cash-details">
        <summary>Cash contribution breakdown</summary>
        <dl>
          <dt>Sales revenue</dt>
          <dd>{money(result.summary.sales_revenue_eur)}</dd>
          <dt>Purchases</dt>
          <dd>− {money(result.summary.purchase_cost_eur)}</dd>
          <dt>Degradation</dt>
          <dd>− {money(result.summary.degradation_cost_eur)}</dd>
          <dt>Transaction fees</dt>
          <dd>− {money(result.summary.transaction_fee_eur)}</dd>
        </dl>
        <p>
          Forecast-valued executed orders only. No continuation value, live
          clearing, or partial execution is modeled.
        </p>
      </details>
      <div className="simulator-card execution-card">
        <div className="simulator-card-heading">
          <div>
            <span className="step-badge">5</span>
            <h2>Order Outcomes</h2>
          </div>
          <details className="column-picker">
            <summary>
              <Columns3 size={15} aria-hidden="true" /> Columns ·{" "}
              {6 + columns.length}
            </summary>
            <div className="column-menu">
              <strong>Additional evidence</strong>
              <span>Choose up to 3 columns.</span>
              {OPTIONAL_COLUMNS.map((column) => (
                <label className="column-option" key={column.id}>
                  <input
                    type="checkbox"
                    checked={columns.includes(column.id)}
                    disabled={
                      !columns.includes(column.id) && columns.length >= 3
                    }
                    onChange={() => toggle(column.id)}
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="table-scroll">
          <table className="execution-table">
            <caption className="sr-only">
              Submitted order clearing and physical execution results
            </caption>
            <thead>
              <tr>
                <th scope="col">Delivery</th>
                <th scope="col">Order</th>
                <th scope="col" className="numeric">
                  Forecast
                </th>
                <th scope="col">Outcome</th>
                <th scope="col" className="numeric">
                  Executed
                </th>
                <th scope="col" className="numeric">
                  Interval-end SoC
                </th>
                {columns.map((column) => (
                  <th scope="col" key={column}>
                    {columnLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((item) => (
                <OutcomeRows
                  key={item.submitted_order.client_order_id}
                  item={item}
                  selected={selectedId === item.submitted_order.client_order_id}
                  columns={columns}
                  zone={result.market.timezone}
                  select={() =>
                    setSelectedId((current) =>
                      current === item.submitted_order.client_order_id
                        ? undefined
                        : item.submitted_order.client_order_id,
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
        {result.validation.findings.length > 0 && (
          <div className="validation-findings">
            <strong>Validation findings</strong>
            {result.validation.findings.map((finding, index) => (
              <p key={`${finding.code}-${index}`}>
                {finding.interval != null
                  ? `${time(result.dispatch[finding.interval].timestamp_utc, result.market.timezone)} · `
                  : ""}
                {finding.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function OutcomeRows({
  item,
  selected,
  columns,
  zone,
  select,
}: {
  item: SimulatedOrderResult;
  selected: boolean;
  columns: OptionalColumn[];
  zone: string;
  select: () => void;
}) {
  const order = item.submitted_order;
  const outcome =
    item.execution_status === "EXECUTED"
      ? "Executed"
      : item.execution_status === "NOT_EXECUTED"
        ? "Price condition not met"
        : "Physically infeasible";
  return (
    <>
      <tr
        className={selected ? "selected" : ""}
        tabIndex={0}
        aria-expanded={selected}
        onClick={select}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        }}
      >
        <td>{time(order.delivery_start_utc, zone)}</td>
        <td>
          <strong>
            {order.order_type} {order.side}
          </strong>
          <small>{number(order.volume_mw)} MW</small>
        </td>
        <td className="numeric">{money(item.forecast_price_eur_mwh)}</td>
        <td>
          <span
            className={`execution-status ${item.execution_status.toLowerCase()}`}
          >
            {outcome}
          </span>
        </td>
        <td className="numeric">{number(item.executed_volume_mw)} MW</td>
        <td className="numeric">{number(item.soc_after_mwh)} MWh</td>
        {columns.map((column) => (
          <td
            key={column}
            className={
              column === "contribution"
                ? item.contribution_eur >= 0
                  ? "numeric positive"
                  : "numeric negative"
                : "numeric"
            }
          >
            {columnValue(column, item)}
          </td>
        ))}
      </tr>
      {selected && (
        <tr className="evidence-row">
          <td colSpan={6 + columns.length}>
            <div>
              <strong>Calculation evidence</strong>
              <span>
                {order.order_type === "MARKET"
                  ? "Market order—no limit-price condition."
                  : item.price_condition_operator == null
                    ? "Price evidence unavailable for this older run."
                    : `${money(item.forecast_price_eur_mwh)}/MWh ${item.price_condition_operator === "<=" ? "≤" : "≥"} ${money(order.limit_price_eur_mwh ?? 0)}/MWh · ${item.price_condition_passed ? "passed" : "failed"} by ${money(Math.abs(item.price_margin_eur_mwh ?? 0))}/MWh.`}
              </span>
              <span>
                Requested {number(order.volume_mw)} MW · executed{" "}
                {number(item.executed_volume_mw)} MW /{" "}
                {number(item.executed_energy_mwh)} MWh.
              </span>
              <span>
                Interval SoC {number(item.soc_before_mwh)} →{" "}
                {number(item.soc_after_mwh)} MWh across{" "}
                {item.interval_order_count ?? 1} submitted order(s). This order
                changes stored energy by {item.soc_delta_mwh >= 0 ? "+" : ""}
                {number(item.soc_delta_mwh)} MWh · contribution{" "}
                {money(item.contribution_eur)}.
              </span>
              <span>{item.reason}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
function columnLabel(column: OptionalColumn) {
  return {
    entered: "Entered",
    limit: "Limit",
    condition: "Condition",
    energy: "Energy",
    socBefore: "SoC before",
    socDelta: "SoC change",
    contribution: "Contribution",
    reason: "Reason",
  }[column];
}
function columnValue(column: OptionalColumn, item: SimulatedOrderResult) {
  const order = item.submitted_order;
  if (column === "entered") return `${number(order.volume_mw)} MW`;
  if (column === "limit")
    return order.limit_price_eur_mwh == null
      ? "—"
      : `${order.side === "BUY" ? "≤" : "≥"} ${money(order.limit_price_eur_mwh)}`;
  if (column === "condition")
    return order.order_type === "MARKET"
      ? "Not applicable"
      : item.price_condition_passed == null
        ? "Not evaluated"
        : item.price_condition_passed
          ? `Passed ${money(Math.abs(item.price_margin_eur_mwh ?? 0))}`
          : `Failed ${money(Math.abs(item.price_margin_eur_mwh ?? 0))}`;
  if (column === "energy") return `${number(item.executed_energy_mwh)} MWh`;
  if (column === "socBefore") return `${number(item.soc_before_mwh)} MWh`;
  if (column === "socDelta")
    return `${item.soc_delta_mwh >= 0 ? "+" : ""}${number(item.soc_delta_mwh)} MWh`;
  if (column === "contribution") return money(item.contribution_eur);
  return item.reason_code.replaceAll("_", " ");
}
function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="sim-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
