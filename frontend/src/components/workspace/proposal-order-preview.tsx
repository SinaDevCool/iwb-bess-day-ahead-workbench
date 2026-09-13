import type { Market, SubmittedOrder } from "@/types/api";
import { clock, num, euro } from "./workspace-format";
import { useDisplayTimezone } from "./time-preference";

/** Read-only staging view of the existing preview response; no second editable order list. */
export function ProposalOrderPreview({
  orders,
  market,
}: {
  orders: SubmittedOrder[];
  market: Market;
}) {
  const zone = useDisplayTimezone();
  return (
    <details>
      <summary>Inspect {orders.length} proposed orders</summary>
      <div className="table-scroll">
        <table className="ws-orders">
          <caption className="sr-only">Proposed orders—not yet applied</caption>
          <thead>
            <tr>
              <th>Delivery</th>
              <th>Side</th>
              <th>Type</th>
              <th>MW</th>
              <th>MWh</th>
              <th>Limit €/MWh</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.client_order_id}>
                <td>{clock(order.delivery_start_utc, zone)}</td>
                <td>{order.side}</td>
                <td>{order.order_type}</td>
                <td>{num(order.volume_mw)}</td>
                <td>{num((order.volume_mw * market.product_minutes) / 60)}</td>
                <td>
                  {order.limit_price_eur_mwh == null ? "No limit" : euro(order.limit_price_eur_mwh)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
