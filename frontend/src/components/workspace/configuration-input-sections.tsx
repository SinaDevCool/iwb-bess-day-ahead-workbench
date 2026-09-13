import type { ComponentProps } from "react";
import type { ConfigurationPanel } from "./configuration-panel";
import { num } from "./workspace-format";
import { MarketDeadline } from "./time-preference";
import { ForecastSnapshot } from "./forecast-snapshot";
type Context = ComponentProps<typeof ConfigurationPanel>["context"];
/** Presentational sections share the controller; no shadow configuration state. */
export function ConfigurationMarket({
  context,
}: {
  context: Pick<Context, "draft" | "busy" | "changeDate" | "priceIssues" | "setModal">;
}) {
  const { draft, busy, changeDate, priceIssues, setModal } = context;
  return (
    <details className="uw-config-section market" open>
      <summary>
        <span className="uw-step">1</span>Market & Forecast
      </summary>
      <label>
        Delivery date
        <input
          id="delivery-date"
          name="delivery-date"
          type="date"
          value={draft.date}
          disabled={Boolean(busy)}
          onChange={(e) => void changeDate(e.target.value)}
        />
      </label>
      <label>
        Product duration
        <select
          value={draft.market.product_minutes}
          disabled={Boolean(busy)}
          onChange={(e) => void changeDate(draft.date, false, Number(e.target.value) as 15 | 60)}
        >
          <option value={60}>60 minutes</option>
          <option value={15}>15 minutes · simulation</option>
        </select>
      </label>
      <p className="ws-help">
        {draft.market.bidding_zone} · {draft.points.length} intervals
      </p>
      <div className="uw-input-summary" aria-label="Current Day-Ahead forecast">
        <strong>Day-Ahead price forecast</strong>
        {!draft.prices.some((price) => price.trim()) ? (
          <span>No forecast loaded</span>
        ) : (
          <>
            {priceIssues.some(Boolean) && (
              <span className="field-error">
                {priceIssues.filter(Boolean).length} prices need attention
              </span>
            )}
            <ForecastSnapshot forecast={draft.forecast} compact />
          </>
        )}
      </div>
      <div className="uw-forecast-actions">
        <button
          className="secondary"
          disabled={Boolean(busy)}
          onClick={() => setModal("load-forecast")}
        >
          {draft.prices.some((price) => price.trim()) ? "Replace forecast" : "Load forecast"}
        </button>
        <button
          className="secondary quiet"
          disabled={Boolean(busy)}
          onClick={() => setModal("forecast")}
        >
          {priceIssues.some(Boolean) ? "Review prices" : "Edit prices"}
        </button>
      </div>
      <button className="ws-text-button" onClick={() => setModal("costs")}>
        Transaction costs
      </button>
      <details className="uw-market-details">
        <summary>Market assumptions</summary>
        <p className="ws-help">
          Case gate closure <MarketDeadline draft={draft} />. No live order submission.
        </p>
      </details>
    </details>
  );
}
export function ConfigurationBattery({
  context,
}: {
  context: Pick<Context, "draft" | "setModal">;
}) {
  const { draft, setModal } = context;
  return (
    <details className="uw-config-section battery" open>
      <summary>
        <span className="uw-step">2</span>Battery & Availability
      </summary>
      <div className="uw-battery-summary">
        <div>
          <strong>{num(draft.battery.capacity_mwh)} MWh</strong>
          <small>Capacity</small>
        </div>
        <div>
          <strong>
            {num(Math.min(draft.battery.max_charge_power_mw, draft.battery.grid_limit_mw))} MW
          </strong>
          <small>Effective charge</small>
        </div>
        <div>
          <strong>
            {num(draft.battery.min_soc_mwh)}–{num(draft.battery.max_soc_mwh)} MWh
          </strong>
          <small>SoC window</small>
        </div>
        <div>
          <strong>{num(draft.battery.target_soc_mwh)} MWh</strong>
          <small>End reserve</small>
        </div>
      </div>
      <p className="ws-help">
        {draft.battery.unavailable_intervals.length} unavailable intervals ·{" "}
        {num(draft.battery.max_equivalent_cycles)} EFC budget
      </p>
      <button className="secondary" onClick={() => setModal("battery")}>
        Edit battery settings
      </button>
    </details>
  );
}
