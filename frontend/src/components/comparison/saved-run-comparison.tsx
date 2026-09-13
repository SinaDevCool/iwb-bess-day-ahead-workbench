"use client";

import { formatForecastLabel } from "@/lib/comparison";
import type { ComparisonMetric } from "@/types/api";
import { Check, X } from "lucide-react";
import { comparisonSelection } from "./comparison-selectors";
import { RunPicker } from "./run-picker";
import { useSavedRunComparison } from "./use-saved-run-comparison";

import { MAX_RUNS, shortId, words } from "./comparison-format";
import { ComparisonTable } from "./comparison-table";
import { RunComparisonChart } from "./run-comparison-chart";
import { RunInspector } from "./run-inspector";
export function SavedRunComparison() {
  const {
    onRunRenamed,
    catalogue,
    runs,
    selectedIds,
    referenceId,
    setReferenceId,
    focusedId,
    setFocusedId,
    metric,
    setMetric,
    query,
    setQuery,
    product,
    setProduct,
    validation,
    setValidation,
    showUnchanged,
    setShowUnchanged,
    loading,
    error,
    addOrRemove,
  } = useSavedRunComparison();
  const reference = runs.find((run) => run.simulation_id === referenceId) ?? runs[0];
  const focused =
    runs.find((run) => run.simulation_id === focusedId) ??
    runs.find((run) => run.simulation_id !== referenceId) ??
    reference;
  const { descriptors, duplicateGroups, filtered } = comparisonSelection(
    runs,
    reference,
    catalogue,
    query,
    product,
    validation,
  );

  if (loading)
    return (
      <div className="state-block">
        <strong>Loading Saved Runs…</strong>
        <span>Preparing comparable optimizer results.</span>
      </div>
    );
  if (error && !runs.length)
    return (
      <div className="state-block" role="alert">
        <strong>Saved Runs Unavailable</strong>
        <span>{error}. Refresh the page to try again.</span>
      </div>
    );
  if (!catalogue.length)
    return (
      <div className="state-block">
        <strong>No Saved Runs Yet</strong>
        <span>Run the optimizer to create the first comparable decision.</span>
      </div>
    );

  return (
    <div className="saved-comparison">
      {error && (
        <div className="status-message error" role="alert">
          {error}
        </div>
      )}
      <section className="run-selection" aria-labelledby="selected-runs-title">
        <div className="comparison-section-heading">
          <div>
            <span className="eyebrow">SAVED SIMULATIONS</span>
            <h3 id="selected-runs-title">
              Selected Runs{" "}
              <small>
                {selectedIds.length}/{MAX_RUNS}
              </small>
            </h3>
          </div>
          <RunPicker
            {...{
              query,
              setQuery,
              product,
              setProduct,
              validation,
              setValidation,
              selectedIds,
              addOrRemove,
              filtered,
            }}
          />
        </div>
        <div className="run-chips">
          {descriptors.map(({ run, key, name, signature }) => (
            <div
              className={`run-chip ${run.simulation_id === focused?.simulation_id ? "active" : ""}`}
              key={run.simulation_id}
            >
              <button
                type="button"
                className="run-chip-focus"
                onClick={() => setFocusedId(run.simulation_id)}
                aria-pressed={run.simulation_id === focused?.simulation_id}
              >
                <span>
                  <i className="run-key">{key}</i>
                  <strong>{name}</strong>
                  {run.simulation_id === referenceId && <b>Reference</b>}
                </span>
                <small>
                  {formatForecastLabel(run.scenario_name)} · {run.market.product_minutes} min ·{" "}
                  {shortId(run.simulation_id)}
                </small>
                <em>{signature}</em>
              </button>
              <button
                type="button"
                className="run-chip-remove"
                aria-label={`Remove ${name} from comparison`}
                onClick={() => addOrRemove(run.simulation_id)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {selectedIds.length === 1 && (
          <p className="comparison-prompt">
            Select at least 1 more completed run to compare results.
          </p>
        )}
        {duplicateGroups.map((group) => (
          <p className="comparison-prompt neutral" key={group[0].run.audit.input_hash}>
            <Check size={14} aria-hidden="true" /> Runs{" "}
            {group.map((item) => item.key).join(" and ")} use identical configuration inputs; their
            saved results may still differ by revision or forecast data.
          </p>
        ))}
      </section>

      {runs.length >= 2 && (
        <>
          <section className="comparison-visual" aria-labelledby="comparison-results-title">
            <div className="comparison-toolbar">
              <div>
                <span className="eyebrow">RUN OUTCOMES</span>
                <h3 id="comparison-results-title">Compare Saved Results</h3>
                <p className="comparison-subtitle">
                  Compare each saved order portfolio using the same 3 Day-Ahead price outcomes.
                </p>
              </div>
              <div className="metric-switch" role="group" aria-label="Comparison metric">
                {(["contribution", "throughput", "cycles", "orders"] as ComparisonMetric[]).map(
                  (item) => (
                    <button
                      type="button"
                      aria-pressed={metric === item}
                      className={metric === item ? "active" : ""}
                      key={item}
                      onClick={() => setMetric(item)}
                    >
                      {item === "throughput" ? "Battery Usage" : words(item)}
                    </button>
                  ),
                )}
              </div>
            </div>
            {metric === "contribution" && (
              <div
                className="outcome-explainer"
                aria-label="How to read the market outcome comparison"
              >
                <div>
                  <strong>1 · Saved Run</strong>
                  <span>The forecast and configuration used to optimize one order portfolio.</span>
                </div>
                <div>
                  <strong>2 · Price Outcomes</strong>
                  <span>
                    The same orders are repriced using lower, central and higher DA prices.
                  </span>
                </div>
                <div>
                  <strong>3 · Net Contribution</strong>
                  <span>Sales minus charging purchases, degradation and transaction fees.</span>
                </div>
              </div>
            )}
            <RunComparisonChart
              runs={runs}
              metric={metric}
              referenceId={referenceId}
              focusedId={focused?.simulation_id}
              onFocus={setFocusedId}
            />
            <ComparisonTable
              runs={runs}
              metric={metric}
              referenceId={referenceId}
              focusedId={focused?.simulation_id}
              onFocus={setFocusedId}
            />
          </section>

          {reference && focused && (
            <RunInspector
              key={`${focused.simulation_id}:${focused.display_name}`}
              run={focused}
              runKey={
                descriptors.find((item) => item.run.simulation_id === focused.simulation_id)?.key ??
                "A"
              }
              reference={reference}
              setReference={() => setReferenceId(focused.simulation_id)}
              showUnchanged={showUnchanged}
              setShowUnchanged={setShowUnchanged}
              onRenamed={onRunRenamed}
            />
          )}
        </>
      )}
    </div>
  );
}
