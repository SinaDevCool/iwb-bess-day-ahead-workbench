"use client";
import { useRef, useState } from "react";
import { useForecastEditor } from "./use-forecast-editor";
import { ForecastPlot } from "@/components/dispatch-chart";
import { parseForecast } from "@/lib/forecast-parser";
import { DialogActions, useDialogCloseGuard } from "./dialog";
import { useDisplayTimezone } from "./time-preference";
import { ForecastPriceTable } from "./forecast-price-table";
import type { Draft } from "./workspace-types";
import { ForecastSnapshot } from "./forecast-snapshot";

/** One editing session; Apply retains the existing validation and draft-update path. */
export function ForecastEditor({
  draft,
  apply,
  cancel,
}: {
  draft: Draft;
  apply: (prices: string[]) => void;
  cancel: () => void;
}) {
  const editor = useForecastEditor(draft, apply);
  const {
    prices,
    setPrices,
    opening,
    baseline,
    hasSource,
    changed,
    pending,
    valid,
    validating,
    paste,
    setPaste,
    error,
    setError,
    invalid,
    submit,
  } = editor;
  const zone = useDisplayTimezone();
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const count = prices.filter((_, index) => changed(index)).length;
  useDialogCloseGuard(() => {
    if (pending) {
      setConfirmClose(true);
      return false;
    }
    return true;
  });
  const pick = (timestamp: string) => {
    setOnlyChanged(false);
    setSelected(timestamp);
    requestAnimationFrame(() => {
      inputs.current[timestamp]?.focus({ preventScroll: true });
      inputs.current[timestamp]?.scrollIntoView({ block: "nearest" });
    });
  };
  return (
    <div className="forecast-editor">
      <ForecastSnapshot forecast={draft.forecast} />
      <p className="ws-help">
        {draft.date} · {draft.market.product_minutes}-minute intervals · Prices in €/MWh. Changes
        remain staged until Apply.
      </p>
      <ForecastPlot
        points={draft.points.map((point, i) => ({
          ...point,
          price_eur_mwh: valid(prices[i]) ? Number(prices[i]) : null,
        }))}
        baseline={baseline.map((value) =>
          value.trim() && Number.isFinite(Number(value)) ? Number(value) : null,
        )}
        baselineLabel={hasSource ? "Original forecast" : "Before editing"}
        zone={zone}
        selected={selected}
        onSelect={pick}
      />
      <div className="forecast-edit-toolbar">
        <div>
          <button
            className="secondary small"
            aria-pressed={!onlyChanged}
            onClick={() => setOnlyChanged(false)}
          >
            All intervals
          </button>{" "}
          <button
            className="secondary small"
            aria-pressed={onlyChanged}
            onClick={() => setOnlyChanged(true)}
          >
            Changed · {count}
          </button>
        </div>
        <button
          className="ws-text-button"
          disabled={!pending || validating}
          onClick={() => setPrices([...opening])}
        >
          Undo session edits
        </button>
        {hasSource && (
          <button
            className="ws-text-button"
            disabled={validating || !count}
            onClick={() => setConfirmReset(true)}
          >
            Restore source forecast
          </button>
        )}
      </div>
      {confirmReset && (
        <div className="ws-notice">
          Restore all recorded source prices? This remains staged until Apply.{" "}
          <button
            onClick={() => {
              setPrices([...baseline]);
              setConfirmReset(false);
            }}
          >
            Restore
          </button>{" "}
          <button onClick={() => setConfirmReset(false)}>Keep edits</button>
        </div>
      )}
      <details className="forecast-paste-panel">
        <summary>Adjust prices by pasting</summary>
        <p>
          One price per line, or HH:mm;price in the selected time zone. For repeated hours use
          offset-aware ISO timestamps.
        </p>
        <label>
          Paste prices
          <textarea
            name="manual-forecast-paste"
            disabled={validating}
            spellCheck={false}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="00:00;55…"
          />
        </label>
        <button
          className="secondary"
          disabled={validating}
          onClick={() => {
            const parsed = parseForecast(
              paste,
              draft.points.length,
              draft.market.min_price_eur_mwh,
              draft.market.max_price_eur_mwh,
              draft.points,
              zone,
            );
            if (parsed.errors.length) setError(parsed.errors.map((item) => item.message).join(" "));
            else {
              setPrices(parsed.values.map(String));
              setError("");
            }
          }}
        >
          Use pasted prices
        </button>
      </details>
      <ForecastPriceTable
        draft={draft}
        editor={editor}
        zone={zone}
        onlyChanged={onlyChanged}
        selected={selected}
        select={setSelected}
        inputs={inputs}
      />
      <DialogActions>
        <span role="status">
          {prices.filter(valid).length}/{draft.points.length} valid · {count} adjusted ·{" "}
          {pending ? "Unsaved changes" : "No unsaved changes"}
        </span>
        {error && (
          <span role="alert" className="field-error">
            {error}
          </span>
        )}
        {confirmClose && (
          <span>
            Discard this session? <button onClick={cancel}>Discard edits</button>
            <button onClick={() => setConfirmClose(false)}>Keep editing</button>
          </span>
        )}
        <button className="secondary" onClick={() => (pending ? setConfirmClose(true) : cancel())}>
          Cancel
        </button>
        {invalid && (
          <button
            className="ws-text-button"
            onClick={() =>
              pick(draft.points[prices.findIndex((value) => !valid(value))].timestamp_utc)
            }
          >
            Review invalid prices
          </button>
        )}
        <button className="primary" disabled={invalid || validating} onClick={submit}>
          {validating ? "Validating…" : "Apply prices"}
        </button>
      </DialogActions>
    </div>
  );
}
