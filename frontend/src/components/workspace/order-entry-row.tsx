"use client";
import { priceCondition, type DraftOrderInput } from "@/lib/order-simulation-validation";
import type { Market, SubmittedOrderType } from "@/types/api";
import { Trash2 } from "lucide-react";
type DraftOrder = DraftOrderInput;
type ForecastPoint = { timestamp_utc: string };
const money = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
    <div className="order-entry-row" data-side={order.side}>
      <span className="row-number">{rowIndex + 1}</span>
      <label className="order-delivery">
        Delivery
        <select
          name={`delivery-${order.id}`}
          aria-label={`Delivery for order ${rowIndex + 1}`}
          aria-invalid={Boolean(issues[`${prefix}.interval`])}
          value={order.interval}
          onChange={(event) => update(order.id, { interval: Number(event.target.value) })}
        >
          {points.map((point, index) => (
            <option value={index} key={point.timestamp_utc}>
              {time(point.timestamp_utc, market.timezone)} · {point.timestamp_utc.slice(11, 16)} UTC
            </option>
          ))}
        </select>
        <small>
          DA forecast:{" "}
          {prices[order.interval]?.trim() && Number.isFinite(forecast)
            ? `${money(forecast)}/MWh`
            : "Not entered"}
        </small>
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
          onChange={(event) => update(order.id, { side: event.target.value as "BUY" | "SELL" })}
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
                event.target.value === "MARKET" ? "" : order.limit || prices[order.interval] || "",
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
            aria-describedby={issues[`${prefix}.volume`] ? `${order.id}-volume-error` : undefined}
            value={order.volume}
            onChange={(event) => update(order.id, { volume: event.target.value })}
          />
          <small>MW</small>
        </span>
        {!issues[`${prefix}.volume`] && (
          <small>
            {order.volume.trim() &&
            Number.isFinite(Number(order.volume)) &&
            Number(order.volume) > 0
              ? `${new Intl.NumberFormat("en-CH", { maximumFractionDigits: 3 }).format((Number(order.volume) * market.product_minutes) / 60)} MWh per interval`
              : "Enter a positive volume in MW"}
          </small>
        )}
        {issues[`${prefix}.volume`] && (
          <small id={`${order.id}-volume-error`} className="field-error">
            {issues[`${prefix}.volume`]}
          </small>
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
              aria-describedby={issues[`${prefix}.limit`] ? `${order.id}-limit-error` : undefined}
              value={order.limit}
              onChange={(event) => update(order.id, { limit: event.target.value })}
            />
            <small>€/MWh</small>
          </span>
          {issues[`${prefix}.limit`] ? (
            <small id={`${order.id}-limit-error`} className="field-error">
              {issues[`${prefix}.limit`]}
            </small>
          ) : (
            preview && (
              <small className={`condition-preview ${preview.passed ? "passed" : "rejected"}`}>
                {preview.passed ? "Price condition met" : "Price condition not met"} at the entered
                forecast · {money(Math.abs(preview.marginEurMwh))}/MWh{" "}
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
