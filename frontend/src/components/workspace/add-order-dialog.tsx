"use client";
import { useRef, useState } from "react";
import { validateOrders, type DraftOrderInput } from "@/lib/order-simulation-validation";
import type { Battery, Market } from "@/types/api";
import { Dialog, DialogActions } from "./dialog";
import { OrderRow } from "./order-entry-row";
import { id } from "./workspace-adapters";

/** Temporary ticket only: cancel never mutates the shared case or its saved result. */
export function AddOrderDialog({
  points,
  prices,
  market,
  battery,
  close,
  add,
}: {
  points: { timestamp_utc: string }[];
  prices: string[];
  market: Market;
  battery: Battery;
  close: () => void;
  add: (order: DraftOrderInput) => void;
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
  const forecast = prices[order.interval];
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
          order={order}
          rowIndex={0}
          points={points}
          market={market}
          issues={attempted ? issues : {}}
          update={(_, patch) => setOrder((current) => ({ ...current, ...patch }))}
        />
        <p className="ws-help">
          {forecast?.trim() && Number.isFinite(Number(forecast))
            ? `DA forecast: €${Number(forecast).toFixed(2)}/MWh. Your limit is entered separately.`
            : "Choose a delivery interval, then enter your order."}
        </p>
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
