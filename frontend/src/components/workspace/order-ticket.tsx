import { useEffect, useRef, type ComponentProps } from "react";
import { X } from "lucide-react";
import type { SimulatedOrderResult } from "@/types/api";
import { OrderRow } from "./order-entry-row";
import { OrderPriceEvidence } from "./order-price-evidence";
import { OrderStatus, deliveryLabel } from "./order-presentation";

type Props = ComponentProps<typeof OrderRow> & {
  outcome?: SimulatedOrderResult;
  stale: boolean;
  close: () => void;
  locate: () => void;
};

/** One ticket is mounted: docked on wide layouts, inline beside its selected row otherwise. */
export function OrderTicket({ outcome, stale, close, locate, ...fields }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, [fields.order.id]);
  const start = fields.points[fields.order.interval]?.timestamp_utc;
  return (
    <aside className="order-ticket" aria-label="Selected order editor">
      <div className="ws-section-head">
        <h3 ref={heading} tabIndex={-1}>
          Edit order · {fields.order.side}
        </h3>
        <button className="icon-button" aria-label="Close order editor" onClick={close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="order-ticket-context">
        {start
          ? deliveryLabel(start, fields.market.product_minutes, fields.market.timezone, true)
          : "Select delivery"}
        <br />
        {fields.market.timezone} · Ref {fields.order.id.slice(-8)}
      </p>
      <OrderRow {...fields} />
      <OrderPriceEvidence order={fields.order} prices={fields.prices} />
      <section className="order-evidence" aria-label="Last simulation outcome">
        <h4>Last simulation</h4>
        <OrderStatus outcome={outcome} stale={stale} />
        <p>
          {stale
            ? "Inputs changed. Simulate again to evaluate this order and its physical feasibility."
            : outcome?.reason || "Simulate the entered orders to evaluate their battery impact."}
        </p>
      </section>
      <footer className="order-ticket-footer">
        <p>Changes update the draft. Re-simulate to refresh outcomes.</p>
        <button className="ws-text-button" disabled={!outcome || stale} onClick={locate}>
          View on schedule
        </button>
      </footer>
    </aside>
  );
}
