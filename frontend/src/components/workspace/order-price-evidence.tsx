import { priceCondition, type DraftOrderInput } from "@/lib/order-simulation-validation";
import { orderNumber } from "./order-presentation";

/** Live price eligibility is not a promise of physical execution. */
export function OrderPriceEvidence({
  order,
  prices,
}: {
  order: DraftOrderInput;
  prices: string[];
}) {
  const price = prices[order.interval] ?? "";
  const valid = price.trim() && Number.isFinite(Number(price));
  const limitValid = order.limit.trim() && Number.isFinite(Number(order.limit));
  const preview =
    valid && limitValid && order.orderType === "LIMIT"
      ? priceCondition(order.side, Number(price), Number(order.limit))
      : undefined;
  return (
    <section className="order-evidence" aria-label="Current price condition" aria-live="polite">
      <h4>Price eligibility</h4>
      {!valid ? (
        <p>Enter a valid forecast for this interval.</p>
      ) : order.orderType === "MARKET" ? (
        <>
          <p>No price limit · forecast €{orderNumber(price, true)}/MWh</p>
        </>
      ) : !preview ? (
        <p>Enter a valid limit price.</p>
      ) : (
        <>
          <p>
            Forecast €{orderNumber(price, true)}{" "}
            {preview.passed ? preview.operator : order.side === "BUY" ? ">" : "<"} limit €
            {orderNumber(order.limit, true)}/MWh
          </p>
          <small>
            {preview.atLimit
              ? "At the limit · eligible"
              : preview.passed
                ? "Price condition met"
                : "Price condition not met"}
          </small>
        </>
      )}
    </section>
  );
}
