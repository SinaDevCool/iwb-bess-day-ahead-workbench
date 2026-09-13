import type { SimulatedOrderResult } from "@/types/api";
import { orderStatus } from "../workspace/order-presentation";
import { euros } from "./chart-config";
/** Explain backend outcomes; never infer execution from a price alone. */
export function IntervalOrderEvidence({
  orders,
  selectedId,
  onSelect,
  onEdit,
}: {
  orders: SimulatedOrderResult[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
}) {
  const selected =
    orders.find((o) => o.submitted_order.client_order_id === selectedId) ?? orders[0];
  if (!selected) return <p className="schedule-order-evidence">No orders in this interval.</p>;
  const order = selected.submitted_order;
  const status = orderStatus(selected).label;
  return (
    <div className="schedule-order-evidence">
      {orders.length > 1 && (
        <label>
          Order{" "}
          <select value={order.client_order_id} onChange={(e) => onSelect?.(e.target.value)}>
            {orders.map((o, i) => (
              <option
                key={o.submitted_order.client_order_id}
                value={o.submitted_order.client_order_id}
              >
                {i + 1} · {o.submitted_order.side} {o.submitted_order.volume_mw} MW
              </option>
            ))}
          </select>
        </label>
      )}
      <strong>
        {order.side} ·{" "}
        {order.order_type === "MARKET"
          ? "Market — no price limit"
          : "Limit " + euros(order.limit_price_eur_mwh ?? 0) + "/MWh"}
      </strong>
      <span>
        {status} · {selected.reason}
      </span>
      {onEdit && (
        <button
          type="button"
          className="ws-text-button"
          onClick={() => onEdit(order.client_order_id)}
        >
          Edit order
        </button>
      )}
    </div>
  );
}
