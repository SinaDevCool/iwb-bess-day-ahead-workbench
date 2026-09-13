import { CheckCircle2, Circle, AlertCircle, MinusCircle } from "lucide-react";
import type { SimulatedOrderResult } from "@/types/api";
import { deliveryTime } from "@/lib/time-presentation";

/** Labels never re-evaluate execution: saved outcomes come from the backend. */
export function orderStatus(outcome?: SimulatedOrderResult, stale = false, invalid = false) {
  if (invalid) return { label: "Check input", tone: "failed", Icon: AlertCircle };
  if (stale) return { label: "Outdated", tone: "neutral", Icon: Circle };
  if (!outcome) return { label: "Not simulated", tone: "neutral", Icon: Circle };
  if (outcome.execution_status === "EXECUTED")
    return { label: "Executed", tone: "passed", Icon: CheckCircle2 };
  if (outcome.execution_status === "NOT_EXECUTED")
    return { label: "Price not met", tone: "neutral", Icon: MinusCircle };
  return { label: "Physical constraint", tone: "failed", Icon: AlertCircle };
}

export function OrderStatus({
  outcome,
  stale = false,
  invalid = false,
}: {
  outcome?: SimulatedOrderResult;
  stale?: boolean;
  invalid?: boolean;
}) {
  const { label, tone, Icon } = orderStatus(outcome, stale, invalid);
  return (
    <span className={`order-status ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

export const orderNumber = (value: string, price = false) =>
  value.trim() && Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-CH", {
        minimumFractionDigits: price ? 2 : 0,
        maximumFractionDigits: price ? 6 : 3,
      }).format(Number(value))
    : "—";

export const deliveryLabel = deliveryTime;
