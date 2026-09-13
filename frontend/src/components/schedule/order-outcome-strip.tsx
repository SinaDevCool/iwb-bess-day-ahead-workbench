import type { Dispatch, SimulatedOrderResult } from "@/types/api";
import { orderStatus } from "../workspace/order-presentation";
import { exact } from "./chart-config";
/** Explicit order controls cannot be mistaken for points on the price scale. */
export function OrderOutcomeStrip({
  rows,
  orders,
  selectedInterval,
  zone,
  onSelect,
}: {
  rows: Dispatch[];
  orders: SimulatedOrderResult[];
  selectedInterval?: string;
  zone: string;
  onSelect: (index: number, id: string) => void;
}) {
  return (
    <details className="schedule-outcomes">
      <summary>
        Inspect orders · {orders.length} entered{" "}
        <span>View execution status and select an order</span>
      </summary>
      <div className="schedule-outcome-list">
        {orders.map((order) => {
          const submitted = order.submitted_order;
          const index = rows.findIndex(
            (row) => Date.parse(row.timestamp_utc) === Date.parse(submitted.delivery_start_utc),
          );
          if (index < 0) return null;
          const status = orderStatus(order).label;
          return (
            <button
              type="button"
              key={submitted.client_order_id}
              aria-pressed={
                new Date(submitted.delivery_start_utc).toISOString() === selectedInterval
              }
              onClick={() => onSelect(index, submitted.client_order_id)}
            >
              {exact(Date.parse(submitted.delivery_start_utc), zone)} · {submitted.side} · {status}
            </button>
          );
        })}
        {!orders.length && (
          <span>
            No orders entered. Add orders in Auction Orders to simulate a battery schedule.
          </span>
        )}
      </div>
    </details>
  );
}
