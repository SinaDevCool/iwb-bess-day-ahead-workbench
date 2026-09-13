"use client";
import type { HistoryDetail as Detail } from "@/types/history";
import type { RefObject } from "react";
export type HistoryTab = "Summary" | "Inputs" | "Activity";
/** Read-only evidence; restoring a snapshot remains an explicit action in the list. */
export function HistoryDetailView({
  detail,
  detailTab,
  setDetailTab,
  detailHeading,
  onBack,
}: {
  detail: Detail;
  detailTab: HistoryTab;
  setDetailTab: (tab: HistoryTab) => void;
  detailHeading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  return (
    <section className="history-detail">
      <div className="ws-section-head">
        <h3 tabIndex={-1} ref={detailHeading}>
          Run {detail.run.simulation_id}
        </h3>
        <button className="secondary" onClick={onBack}>
          Back to saved runs
        </button>
      </div>
      <div className="uw-comparison-switch">
        {(["Summary", "Inputs", "Activity"] as const).map((tab) => (
          <button
            className="secondary"
            aria-pressed={detailTab === tab}
            key={tab}
            onClick={() => setDetailTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {detailTab === "Summary" && (
        <>
          <p>
            {"run_type" in detail.run ? "Order simulation" : "Optimization proposal"} ·{" "}
            {detail.run.delivery_date} · {detail.run.validation.status}
          </p>
          <p>
            Forecast: {detail.run.forecast?.source_name ?? "Legacy forecast"} ·{" "}
            {detail.run.forecast?.version ?? "Version unavailable"}
          </p>
          <p>This immutable snapshot is separate from the current draft.</p>
        </>
      )}
      {detailTab === "Inputs" && (
        <>
          <dl className="history-inputs">
            <div>
              <dt>Delivery</dt>
              <dd>
                {detail.run.delivery_date} · {detail.run.market.product_minutes} minutes ·{" "}
                {detail.run.market.timezone}
              </dd>
            </div>
            <div>
              <dt>Battery</dt>
              <dd>
                {detail.run.battery.capacity_mwh} MWh · Charge{" "}
                {detail.run.battery.max_charge_power_mw} MW · Discharge{" "}
                {detail.run.battery.max_discharge_power_mw} MW
              </dd>
            </div>
            <div>
              <dt>Stored energy</dt>
              <dd>
                Initial {detail.run.battery.initial_soc_mwh} MWh · Allowed{" "}
                {detail.run.battery.min_soc_mwh}–{detail.run.battery.max_soc_mwh} MWh · End reserve{" "}
                {detail.run.battery.target_soc_mwh} MWh
              </dd>
            </div>
            <div>
              <dt>Forecast</dt>
              <dd>
                {detail.run.forecast?.source_name ?? "Legacy forecast"} ·{" "}
                {detail.run.forecast_points?.length ?? detail.run.dispatch.length} interval prices
              </dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>
                {"submitted_orders" in detail.run
                  ? detail.run.submitted_orders.length
                  : detail.run.orders.length}{" "}
                saved orders
              </dd>
            </div>
          </dl>
          <details>
            <summary>Exact saved inputs</summary>
            <pre>
              {JSON.stringify(
                {
                  battery: detail.run.battery,
                  market: detail.run.market,
                  forecast: detail.run.forecast,
                  prices: detail.run.forecast_points,
                  orders:
                    "submitted_orders" in detail.run
                      ? detail.run.submitted_orders
                      : detail.run.orders,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
      {detailTab === "Activity" && (
        <>
          <p>Recorded events only; unsaved edits are not a keystroke log.</p>
          {detail.events.map((event) => (
            <details key={event.event_id}>
              <summary>
                {new Date(event.created_at).toLocaleString("en-GB")} ·{" "}
                {event.event_type.replaceAll("_", " ")}
              </summary>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          ))}
          {!detail.events.length && <p>No recorded events.</p>}
        </>
      )}
    </section>
  );
}
