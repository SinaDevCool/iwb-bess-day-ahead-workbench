import { Fragment, type ReactNode, type RefObject } from "react";
import type { OrderSimulation } from "@/types/api";
import type { Draft } from "./workspace-types";
import { OrderStatus, orderNumber, deliveryLabel } from "./order-presentation";
import { useDisplayTimezone } from "./time-preference";

type Props = {
  draft: Draft;
  result?: OrderSimulation;
  dirty: boolean;
  selected: string;
  issues: Record<string, string>;
  ticket: ReactNode;
  wide: boolean;
  rowRefs: RefObject<Record<string, HTMLButtonElement | null>>;
  select: (id: string, opener: HTMLButtonElement) => void;
};

export function OrdersTable({
  draft,
  result,
  dirty,
  selected,
  issues,
  ticket,
  wide,
  rowRefs,
  select,
}: Props) {
  const zone = useDisplayTimezone();
  return (
    <div className="table-scroll">
      <table className="ws-orders">
        <caption className="sr-only">Entered orders · simulated outcomes</caption>
        <thead>
          <tr>
            <th scope="col">Delivery</th>
            <th scope="col">Side</th>
            <th scope="col">Type</th>
            <th scope="col">Volume MW</th>
            <th scope="col">Limit €/MWh</th>
            <th scope="col">Simulation</th>
          </tr>
        </thead>
        <tbody>
          {[...draft.orders]
            .sort((a, b) => a.interval - b.interval)
            .map((order) => {
              const outcome = result?.order_results.find(
                (item) => item.submitted_order.client_order_id === order.id,
              );
              const invalid = Object.keys(issues).some((key) =>
                key.startsWith(`order.${order.id}.`),
              );
              const start = draft.points[order.interval]?.timestamp_utc;
              const delivery = start
                ? deliveryLabel(start, draft.market.product_minutes, zone)
                : "Select delivery";
              return (
                <Fragment key={order.id}>
                  <tr
                    className={selected === order.id ? "selected" : ""}
                    onClick={(event) => {
                      if (
                        (event.target as HTMLElement).closest("button, a, input, select") ||
                        window.getSelection()?.toString()
                      )
                        return;
                      const opener = rowRefs.current[order.id];
                      if (opener) select(order.id, opener);
                    }}
                  >
                    <td>
                      <button
                        className="ws-row-link"
                        ref={(node) => {
                          rowRefs.current[order.id] = node;
                        }}
                        aria-label={`Edit ${delivery} ${order.side} order ${order.id.slice(-8)}`}
                        aria-expanded={selected === order.id}
                        onClick={(event) => select(order.id, event.currentTarget)}
                      >
                        {delivery}
                      </button>
                    </td>
                    <td>
                      <span className={`side ${order.side.toLowerCase()}`}>{order.side}</span>
                    </td>
                    <td>{order.orderType === "MARKET" ? "Market" : "Limit"}</td>
                    <td>{orderNumber(order.volume)}</td>
                    <td>
                      {order.orderType === "MARKET" ? "No limit" : orderNumber(order.limit, true)}
                    </td>
                    <td>
                      <OrderStatus
                        outcome={outcome}
                        stale={Boolean(result) && dirty}
                        invalid={invalid}
                      />
                    </td>
                  </tr>
                  {selected === order.id && !wide && (
                    <tr className="order-ticket-row">
                      <td colSpan={6}>{ticket}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
        </tbody>
      </table>
      {!draft.orders.length && (
        <p className="ws-empty">
          No orders yet. Add an order or request additional-order suggestions.
        </p>
      )}
    </div>
  );
}
