"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import type { ReadyWorkbench } from "./use-workbench";
import { num } from "./workspace-format";
/** Presentation only: all shared state remains in the workbench controller. */
export function ConfigurationPanel({
  context,
}: {
  context: Pick<
    ReadyWorkbench,
    | "reviewSettings"
    | "setReviewSettings"
    | "draft"
    | "busy"
    | "setModal"
    | "setPreview"
    | "setError"
    | "risk"
    | "setRisk"
    | "horizon"
    | "setHorizon"
    | "terminal"
    | "setTerminal"
    | "weights"
    | "setWeights"
    | "lookahead"
    | "setLookahead"
    | "configurationOpen"
    | "setConfigurationOpen"
    | "priceIssues"
    | "changeDate"
  >;
}) {
  const {
    draft,
    reviewSettings,
    setReviewSettings,
    busy,
    setModal,
    setPreview,
    setError,
    risk,
    setRisk,
    horizon,
    setHorizon,
    terminal,
    setTerminal,
    weights,
    setWeights,
    lookahead,
    setLookahead,
    configurationOpen,
    setConfigurationOpen,
    priceIssues,
    changeDate,
  } = context;
  const policyRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!reviewSettings || !configurationOpen) return;
    const frame = requestAnimationFrame(() => {
      if (policyRef.current) {
        policyRef.current.open = true;
        policyRef.current.scrollIntoView?.({ block: "nearest" });
        policyRef.current.querySelector("select")?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [reviewSettings, configurationOpen]);
  const invalidatePreview = () => {
    setPreview(undefined);
    setError("");
  };
  return (
    <aside className="uw-config" aria-label="Shared case configuration" hidden={!configurationOpen}>
      <div className="ws-section-head">
        <h2>Case configuration</h2>
        <button
          className="icon-button"
          aria-label="Collapse configuration"
          onClick={() => setConfigurationOpen(false)}
        >
          <X size={16} />
        </button>
      </div>
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
          {draft.market.bidding_zone} · {draft.market.timezone} · {draft.points.length} intervals
        </p>
        <div className="uw-input-summary" aria-label="Current Day-Ahead forecast">
          <strong>Day-Ahead price forecast</strong>
          <span>
            {priceIssues.filter((x) => !x).length}/{draft.points.length} valid
          </span>
          <small>
            {draft.forecast?.source_name ?? "Entered forecast"} · €/MWh
            {draft.forecast?.adjusted_intervals
              ? ` · ${draft.forecast.adjusted_intervals} adjusted interval${draft.forecast.adjusted_intervals === 1 ? "" : "s"}`
              : ""}
          </small>
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
            className="ws-text-button"
            disabled={Boolean(busy)}
            onClick={() => setModal("forecast")}
          >
            {priceIssues.some(Boolean) ? "Review prices" : "Edit prices"}
          </button>
        </div>
        <p className="ws-help">Used as the assumed auction clearing price.</p>
        <button className="ws-text-button" onClick={() => setModal("costs")}>
          Transaction costs
        </button>
        <details className="uw-market-details">
          <summary>Market assumptions</summary>
          <p className="ws-help">
            Case gate closure {draft.market.gate_closure_local} · {draft.market.timezone}. No live
            order submission.
          </p>
        </details>
      </details>
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
      <details className="uw-config-section policy" ref={policyRef}>
        <summary>
          <span className="uw-step">3</span>Proposal settings
        </summary>
        {reviewSettings && (
          <button
            className="secondary"
            onClick={() => {
              setReviewSettings(false);
              setModal("proposal");
            }}
          >
            Return to proposal
          </button>
        )}
        <p className="ws-help">
          Used only when generating a proposal. Does not change execution of entered orders.
        </p>
        <div className="ws-fields">
          <label>
            Decision posture
            <select
              value={risk}
              disabled={Boolean(busy)}
              onChange={(e) => {
                setRisk(e.target.value);
                invalidatePreview();
              }}
            >
              <option value="expected_value">Expected value</option>
              <option value="balanced">Balanced</option>
              <option value="downside_protected">Downside protected</option>
            </select>
          </label>
          <label>
            End-of-day policy
            <select
              value={horizon}
              disabled={Boolean(busy)}
              onChange={(e) => {
                setHorizon(e.target.value);
                invalidatePreview();
              }}
            >
              <option value="minimum_reserve">Minimum reserve</option>
              <option value="terminal_value">Configured terminal value</option>
              <option value="next_day_proxy">Next-day replacement proxy</option>
              <option value="multi_day">Next-day opportunity proxy</option>
            </select>
          </label>
          {horizon === "terminal_value" && (
            <label>
              Terminal value €/MWh
              <input
                type="number"
                value={terminal}
                disabled={Boolean(busy)}
                onChange={(e) => {
                  setTerminal(e.target.value);
                  invalidatePreview();
                }}
              />
            </label>
          )}
          {["next_day_proxy", "multi_day"].includes(horizon) && (
            <label>
              Lookahead hours
              <input
                type="number"
                value={lookahead}
                disabled={Boolean(busy)}
                onChange={(e) => {
                  setLookahead(e.target.value);
                  invalidatePreview();
                }}
              />
            </label>
          )}
        </div>
        <details>
          <summary>Scenario probabilities</summary>
          <div className="ws-fields">
            {["Downside %", "Central %", "Upside %"].map((label, i) => (
              <label key={label}>
                {label}
                <input
                  type="number"
                  value={weights[i]}
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    setWeights((w) => w.map((v, j) => (j === i ? e.target.value : v)));
                    invalidatePreview();
                  }}
                />
              </label>
            ))}
          </div>
          <p>Best of three evaluated candidate schedules; probabilities must total 100%.</p>
        </details>
      </details>
    </aside>
  );
}
