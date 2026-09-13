"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import type { ReadyWorkbench } from "./use-workbench";
import { ConfigurationMarket, ConfigurationBattery } from "./configuration-input-sections";

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
      <ConfigurationMarket context={context} />
      <ConfigurationBattery context={context} />
      <details className="uw-config-section policy" ref={policyRef}>
        <summary>
          <span className="uw-step">3</span>Proposal settings{" "}
          <small className="uw-optional">Optional</small>
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
