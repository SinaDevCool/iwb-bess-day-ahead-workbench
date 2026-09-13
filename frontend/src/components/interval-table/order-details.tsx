import type { intervalEvidence } from "@/lib/interval-evidence";
import { n } from "./columns";
import { OrderStatus } from "../workspace/order-presentation";
import { useDisplayTimezone } from "../workspace/time-preference";
import { deliveryTime } from "@/lib/time-presentation";

/** Interval energy is shared by every order; order fields never imply sequential dispatch. */
export function IntervalOrderDetails({
  row,
  onEditOrder,
  onClose,
}: {
  row: ReturnType<typeof intervalEvidence>[number];
  onEditOrder?: (id: string) => void;
  onClose?: () => void;
}) {
  const zone = useDisplayTimezone();
  const action =
    row.action === "idle" ? "Idle" : row.action === "charge" ? "Charging" : "Discharging";
  return (
    <div className="interval-order-details">
      <header>
        <h4>
          {deliveryTime(row.timestamp_utc, (row.end - row.start) / 60000, zone)}{" "}
          <span>{action}</span>
        </h4>
        {onClose && (
          <button className="ws-text-button" onClick={onClose}>
            Close details
          </button>
        )}
      </header>
      <dl className="interval-detail-values">
        <div>
          <dt>Stored energy</dt>
          <dd>
            {n(row.socBefore)} → {n(row.soc_mwh)} MWh
          </dd>
        </div>
        <div>
          <dt>
            {row.action === "charge"
              ? "Energy charged"
              : row.action === "discharge"
                ? "Energy discharged"
                : "Energy transferred"}
          </dt>
          <dd>{n(Math.abs(row.grid_energy_mwh))} MWh</dd>
        </div>
      </dl>
      {!row.orders.length && <p>No orders were entered for this interval.</p>}
      {row.orders.length > 0 && row.action === "idle" && (
        <p>No battery movement. See the order outcomes below.</p>
      )}
      {row.orders.map((o) => (
        <article key={o.submitted_order.client_order_id}>
          <header>
            <div className="interval-order-heading">
              <strong>
                {o.submitted_order.side} ·{" "}
                {o.submitted_order.order_type === "MARKET" ? "Market" : "Limit"}
              </strong>
              <OrderStatus outcome={o} />
            </div>
            {onEditOrder && (
              <button
                className="secondary small"
                onClick={() => onEditOrder(o.submitted_order.client_order_id)}
              >
                Edit order →
              </button>
            )}
          </header>
          <dl className="interval-detail-values">
            <div>
              <dt>Entered volume</dt>
              <dd>{n(o.submitted_order.volume_mw)} MW</dd>
            </div>
            <div>
              <dt>Executed volume</dt>
              <dd>{n(o.executed_volume_mw)} MW</dd>
            </div>
            <div>
              <dt>Limit price</dt>
              <dd>
                {o.submitted_order.order_type === "MARKET"
                  ? "No price limit"
                  : "€" + n(o.submitted_order.limit_price_eur_mwh!) + "/MWh"}
              </dd>
            </div>
            <div>
              <dt>Simulated price</dt>
              <dd>
                {o.execution_price_eur_mwh == null
                  ? "—"
                  : "€" + n(o.execution_price_eur_mwh) + "/MWh"}
              </dd>
            </div>
          </dl>
          {o.execution_status !== "EXECUTED" && <p className="interval-order-reason">{o.reason}</p>}
        </article>
      ))}
    </div>
  );
}
