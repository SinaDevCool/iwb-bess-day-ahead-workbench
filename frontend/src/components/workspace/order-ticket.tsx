import { useEffect, useRef, type ComponentProps } from "react";
import { X, Trash2, ArrowRight } from "lucide-react";
import type { SimulatedOrderResult } from "@/types/api";
import { OrderRow } from "./order-entry-row";
import { OrderPriceEvidence } from "./order-price-evidence";
import { OrderStatus, orderReason } from "./order-presentation";

type Props = ComponentProps<typeof OrderRow> & {
  prices: string[];
  remove: (order: ComponentProps<typeof OrderRow>["order"]) => void;
  outcome?: SimulatedOrderResult;
  stale: boolean;
  close: () => void;
  locate: () => void;
};

/** One ticket is mounted: docked on wide layouts, inline beside its selected row otherwise. */
export function OrderTicket({ outcome, stale, close, locate, prices, remove, ...fields }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, [fields.order.id]);
  return (
    <aside className="order-ticket" aria-label="Selected order editor">
      <div className="ws-section-head">
        <h3 ref={heading} tabIndex={-1}>
          Edit order
        </h3>
        <button className="icon-button" aria-label="Close order editor" onClick={close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <OrderRow {...fields} />
      {fields.order.origin === "suggested" ? (
        <label className="order-protection">
          <input
            type="checkbox"
            checked={fields.order.protected !== false}
            onChange={(e) => fields.update(fields.order.id, { protected: e.target.checked })}
          />
          Keep unchanged during re-optimization
        </label>
      ) : (
        <p className="ws-help">Manual order · kept unchanged</p>
      )}
      <OrderPriceEvidence order={fields.order} prices={prices} />
      <section className="order-evidence" aria-label="Last simulation outcome">
        <h4>Simulation</h4>
        <OrderStatus outcome={outcome} stale={stale} />
        {!stale && outcome && !["EXECUTED", "NOT_EXECUTED"].includes(outcome.execution_status) && (
          <p className="field-error">{orderReason(outcome)}</p>
        )}
      </section>
      <footer className="order-ticket-footer">
        <button
          className="secondary order-schedule-link"
          disabled={!outcome || stale}
          onClick={locate}
        >
          View battery schedule <ArrowRight size={16} aria-hidden="true" />
        </button>
        {(!outcome || stale) && (
          <small>
            {stale
              ? "Inputs changed — simulate again to view."
              : "Simulate battery dispatch to view the schedule."}
          </small>
        )}
      </footer>
      <details className="order-calculation-details">
        <summary>Calculation details</summary>
        <p>
          Price eligibility is separate from battery feasibility. Simulated settlement uses the
          forecast price, not the limit. At the limit, full allocation is assumed.
        </p>
        {!stale && outcome && ["EXECUTED", "NOT_EXECUTED"].includes(outcome.execution_status) && (
          <p>{orderReason(outcome)}</p>
        )}
        <small>Order reference: {fields.order.id}</small>
      </details>
      <button
        type="button"
        className="ws-text-button order-remove"
        aria-label={`Remove order ${fields.rowIndex + 1}`}
        onClick={() => remove(fields.order)}
      >
        <Trash2 size={14} aria-hidden="true" />
        Remove order
      </button>
    </aside>
  );
}
