import type { intervalEvidence } from "@/lib/interval-evidence";
import { n } from "./columns";
import { OrderStatus, isPhysicallyRejected } from "../workspace/order-presentation";
import { AtLimit } from "../workspace/at-limit";
import { useDisplayTimezone } from "../workspace/time-preference";
import { deliveryTime } from "@/lib/time-presentation";

/** Combined states appear once; signed per-order deltas come from backend evidence. */
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
    <section className="interval-order-details" aria-label="Selected interval details">
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
          <dt>Combined stored energy</dt>
          <dd>
            {n(row.socBefore)} → {n(row.soc_mwh)} MWh
          </dd>
        </div>
        <div>
          <dt>
            {row.action === "charge"
              ? "Grid energy imported"
              : row.action === "discharge"
                ? "Grid energy exported"
                : "Grid energy transferred"}
          </dt>
          <dd>{n(Math.abs(row.grid_energy_mwh))} MWh</dd>
        </div>
      </dl>
      {!row.orders.length ? (
        <p>No orders were entered for this interval.</p>
      ) : (
        <>
          {row.action === "idle" && <p>No battery movement. See the order outcomes below.</p>}
          <div className="table-scroll interval-order-scroll">
            <table className="interval-order-table">
              <caption className="sr-only">Order contributions for the selected interval</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col" className="numeric">
                    Executed (MW)
                  </th>
                  <th scope="col" className="numeric">
                    Limit (€/MWh)
                  </th>
                  <th scope="col" className="numeric">
                    Stored-energy change (MWh)
                  </th>
                  <th scope="col">Status</th>
                  {onEditOrder && (
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {row.orders.map((outcome) => {
                  const order = outcome.submitted_order;
                  const atLimit =
                    order.order_type === "LIMIT" &&
                    outcome.forecast_price_eur_mwh === order.limit_price_eur_mwh;
                  return (
                    <tr
                      key={order.client_order_id}
                      className={isPhysicallyRejected(outcome) ? "physical-rejection" : ""}
                    >
                      <td>
                        {order.side} · {order.order_type === "MARKET" ? "Market" : "Limit"}
                      </td>
                      <td className="numeric">
                        {n(outcome.executed_volume_mw)}
                        {outcome.executed_volume_mw !== order.volume_mw && (
                          <small>Entered {n(order.volume_mw)}</small>
                        )}
                      </td>
                      <td className="numeric">
                        {order.order_type === "MARKET" ? "No limit" : n(order.limit_price_eur_mwh!)}
                        {atLimit && <AtLimit />}
                      </td>
                      <td className="numeric">
                        {Number.isFinite(outcome.soc_delta_mwh)
                          ? (outcome.soc_delta_mwh > 0 ? "+" : "") + n(outcome.soc_delta_mwh)
                          : "—"}
                      </td>
                      <td>
                        <OrderStatus outcome={outcome} />
                        {outcome.execution_status !== "EXECUTED" && (
                          <small className="interval-order-reason">{outcome.reason}</small>
                        )}
                      </td>
                      {onEditOrder && (
                        <td>
                          <button
                            className="secondary small"
                            aria-label={
                              "Edit " + order.side.toLowerCase() + " order " + order.client_order_id
                            }
                            onClick={() => onEditOrder(order.client_order_id)}
                          >
                            Edit order →
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
