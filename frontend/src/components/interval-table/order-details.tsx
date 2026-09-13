import type { intervalEvidence } from "@/lib/interval-evidence";
import { n } from "./columns";
/** Orders share interval SoC; their outcomes are not sequential sub-interval dispatch. */
export function IntervalOrderDetails({
  row,
  onEditOrder,
}: {
  row: ReturnType<typeof intervalEvidence>[number];
  onEditOrder?: (id: string) => void;
}) {
  return (
    <div className="interval-order-details">
      <p>
        Interval SoC: {n(row.socBefore)} → {n(row.soc_mwh)} MWh. Shared interval state, not a
        separate state per order.
      </p>
      {row.orders.map((o) => (
        <article key={o.submitted_order.client_order_id}>
          <strong>
            {o.submitted_order.side} {o.submitted_order.order_type} ·{" "}
            {o.execution_status.replaceAll("_", " ")}
          </strong>
          <p>
            Entered {n(o.submitted_order.volume_mw)} MW · executed {n(o.executed_volume_mw)} MW /{" "}
            {n(o.executed_energy_mwh)} MWh ·{" "}
            {o.submitted_order.order_type === "MARKET"
              ? "No price limit"
              : `Limit ${n(o.submitted_order.limit_price_eur_mwh!)} €/MWh`}{" "}
            · simulated price{" "}
            {o.execution_price_eur_mwh == null ? "—" : `${n(o.execution_price_eur_mwh)} €/MWh`} ·
            contribution €{n(o.contribution_eur)}
          </p>
          <p>{o.reason}</p>
          {onEditOrder && (
            <button
              className="secondary small"
              onClick={() => onEditOrder(o.submitted_order.client_order_id)}
            >
              Edit order
            </button>
          )}
          <small>Order {o.submitted_order.client_order_id}</small>
        </article>
      ))}
    </div>
  );
}
