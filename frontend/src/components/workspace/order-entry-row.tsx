"use client";
import type { DraftOrderInput } from "@/lib/order-simulation-validation";
import type { Market, SubmittedOrderType } from "@/types/api";
import { Trash2 } from "lucide-react";
import { deliveryLabel } from "./order-presentation";
import { useDisplayTimezone } from "./time-preference";

/** Controlled fields only. Price and saved-execution evidence live outside the form grid. */
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
  order: DraftOrderInput;
  rowIndex: number;
  points: { timestamp_utc: string }[];
  prices: string[];
  market: Market;
  issues: Record<string, string>;
  update: (id: string, patch: Partial<DraftOrderInput>) => void;
  remove: (order: DraftOrderInput) => void;
}) {
  const prefix = `order.${order.id}`;
  const zone = useDisplayTimezone();
  return (
    <div className="order-ticket-fields">
      <label className="order-delivery">
        Delivery
        <select
          name={`delivery-${order.id}`}
          aria-label={`Delivery for order ${rowIndex + 1}`}
          aria-invalid={Boolean(issues[`${prefix}.interval`])}
          aria-describedby={issues[`${prefix}.interval`] ? `${order.id}-delivery-error` : undefined}
          value={order.interval}
          onChange={(e) => update(order.id, { interval: Number(e.target.value) })}
        >
          {points.map((point, index) => (
            <option key={point.timestamp_utc} value={index}>
              {deliveryLabel(point.timestamp_utc, market.product_minutes, zone)}
            </option>
          ))}
        </select>
        {issues[`${prefix}.interval`] && (
          <small id={`${order.id}-delivery-error`} className="field-error">
            {issues[`${prefix}.interval`]}
          </small>
        )}
      </label>
      <label>
        Side
        <select
          name={`side-${order.id}`}
          aria-label={`Side for order ${rowIndex + 1}`}
          value={order.side}
          onChange={(e) => update(order.id, { side: e.target.value as "BUY" | "SELL" })}
        >
          <option>BUY</option>
          <option>SELL</option>
        </select>
      </label>
      <label>
        Order type
        <select
          name={`type-${order.id}`}
          aria-label={`Type for order ${rowIndex + 1}`}
          value={order.orderType}
          onChange={(e) =>
            update(order.id, {
              orderType: e.target.value as SubmittedOrderType,
              limit: e.target.value === "MARKET" ? "" : order.limit || prices[order.interval] || "",
            })
          }
        >
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
        </select>
      </label>
      <label>
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
            aria-describedby={`${order.id}-volume-help`}
            value={order.volume}
            onChange={(e) => update(order.id, { volume: e.target.value })}
          />
          <small>MW</small>
        </span>
        <small
          id={`${order.id}-volume-help`}
          className={issues[`${prefix}.volume`] ? "field-error" : undefined}
        >
          {issues[`${prefix}.volume`] ||
            (order.volume.trim() &&
            Number.isFinite(Number(order.volume)) &&
            Number(order.volume) > 0
              ? `${new Intl.NumberFormat("en-CH", { maximumFractionDigits: 3 }).format((Number(order.volume) * market.product_minutes) / 60)} MWh for this interval`
              : "Enter a positive volume in MW")}
        </small>
      </label>
      {order.orderType === "LIMIT" ? (
        <label>
          {order.side === "BUY" ? "Maximum buy price" : "Minimum sell price"}
          <span className="unit-input">
            <input
              name={`limit-${order.id}`}
              type="number"
              inputMode="decimal"
              autoComplete="off"
              step={market.price_increment_eur_mwh}
              aria-label={`Limit price for order ${rowIndex + 1}`}
              aria-invalid={Boolean(issues[`${prefix}.limit`])}
              aria-describedby={issues[`${prefix}.limit`] ? `${order.id}-limit-error` : undefined}
              value={order.limit}
              onChange={(e) => update(order.id, { limit: e.target.value })}
            />
            <small>€/MWh</small>
          </span>
          {issues[`${prefix}.limit`] && (
            <small id={`${order.id}-limit-error`} className="field-error">
              {issues[`${prefix}.limit`]}
            </small>
          )}
        </label>
      ) : (
        <div className="order-no-limit">
          <span>Limit price</span>
          <strong>No limit</strong>
        </div>
      )}
      <button
        type="button"
        className="ws-text-button order-remove"
        aria-label={`Remove order ${rowIndex + 1}`}
        onClick={() => remove(order)}
      >
        <Trash2 size={14} aria-hidden="true" />
        Remove order
      </button>
    </div>
  );
}
