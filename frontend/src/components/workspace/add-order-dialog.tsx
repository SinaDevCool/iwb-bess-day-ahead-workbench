"use client";
import { useRef, useState } from "react";
import { validateOrders, type DraftOrderInput } from "@/lib/order-simulation-validation";
import type { Battery, Market } from "@/types/api";
import { Dialog, DialogActions } from "./dialog";
import { OrderRow } from "./order-entry-row";
import { OrderPriceEvidence } from "./order-price-evidence";
import { id } from "./workspace-adapters";

/** Temporary ticket only: cancel never mutates the shared case or its saved result. */
export function AddOrderDialog({
  points,
  prices,
  market,
  battery,
  close,
  add,
  orders,
}: {
  points: { timestamp_utc: string }[];
  prices: string[];
  market: Market;
  battery: Battery;
  close: () => void;
  add: (order: DraftOrderInput) => void;
  orders?: DraftOrderInput[];
}) {
  const [order, setOrder] = useState<DraftOrderInput>(() => ({
    id: id(),
    interval: -1,
    side: "BUY",
    orderType: "LIMIT",
    volume: "",
    limit: "",
  }));
  const [attempted, setAttempted] = useState(false);
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const issues = validateOrders([order], market, battery, points.length);
  function submit() {
    if (submitted.current) return;
    if (Object.keys(issues).length) {
      setAttempted(true);
      // Focus after inline errors render; native validation cannot check market increments.
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    submitted.current = true;
    add(order);
  }
  return (
    <Dialog title="Add order" close={close}>
      <form
        id="new-order-form"
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <OrderRow
          orders={orders}
          order={order}
          rowIndex={0}
          points={points}
          market={market}
          issues={attempted ? issues : {}}
          update={(_, patch) => setOrder((current) => ({ ...current, ...patch }))}
        />
        {order.interval >= 0 ? (
          <OrderPriceEvidence order={order} prices={prices} />
        ) : (
          <p className="ws-help">Choose a delivery interval, then enter your order.</p>
        )}
      </form>
      <DialogActions>
        <button className="secondary" onClick={close}>
          Cancel
        </button>
        <button type="submit" form="new-order-form" className="primary">
          Add order
        </button>
      </DialogActions>
    </Dialog>
  );
}
