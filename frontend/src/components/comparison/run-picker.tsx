import { formatForecastLabel } from "@/lib/comparison";
import { ChevronDown, Plus, Search } from "lucide-react";
import { formatRunTime, MAX_RUNS, money, shortId } from "./comparison-format";
import type { useSavedRunComparison } from "./use-saved-run-comparison";
type Controller = ReturnType<typeof useSavedRunComparison>;
type Props = Pick<
  Controller,
  | "query"
  | "setQuery"
  | "product"
  | "setProduct"
  | "validation"
  | "setValidation"
  | "selectedIds"
  | "addOrRemove"
> & { filtered: Controller["catalogue"] };
/** Filter controls do not own or fetch selected simulation snapshots. */
export function RunPicker({
  query,
  setQuery,
  product,
  setProduct,
  validation,
  setValidation,
  selectedIds,
  addOrRemove,
  filtered,
}: Props) {
  return (
    <details className="run-picker">
      <summary aria-label="Add or remove simulation runs">
        <Plus size={15} aria-hidden="true" /> Add Run <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="run-picker-panel">
        <div className="run-picker-title">
          <strong>Choose Up to {MAX_RUNS} Runs</strong>
          <span>Every run retains its exact saved configuration.</span>
        </div>
        <label className="run-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search saved runs</span>
          <input
            name="run-search"
            autoComplete="off"
            placeholder="Search preset, date or run ID…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="run-filters">
          <label>
            <span className="sr-only">Product duration</span>
            <select
              name="run-product"
              value={product}
              onChange={(event) => setProduct(event.target.value)}
            >
              <option value="ALL">All Products</option>
              <option value="60">60 Minutes</option>
              <option value="15">15 Minutes</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Validation status</span>
            <select
              name="run-validation"
              value={validation}
              onChange={(event) => setValidation(event.target.value)}
            >
              <option value="ALL">All Results</option>
              <option value="passed">Passed</option>
              <option value="warning">Warning</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        </div>
        <div className="run-options">
          {filtered.map((run) => {
            const checked = selectedIds.includes(run.simulation_id);
            const disabled = !checked && selectedIds.length >= MAX_RUNS;
            return (
              <label className={`run-option ${checked ? "selected" : ""}`} key={run.simulation_id}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => addOrRemove(run.simulation_id)}
                />
                <span>
                  <strong>{run.display_name}</strong>
                  <small>
                    {formatForecastLabel(run.scenario_name)} · {formatRunTime(run.created_at_utc)} ·{" "}
                    {run.product_minutes} min ·{" "}
                    <span translate="no">{shortId(run.simulation_id)}</span>
                  </small>
                </span>
                <b>{money(run.expected_contribution_eur)}</b>
              </label>
            );
          })}
        </div>
        {!filtered.length && <p className="picker-empty">No saved runs match these filters.</p>}
      </div>
    </details>
  );
}
