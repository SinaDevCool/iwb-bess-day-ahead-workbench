"use client";
import { useForecastEditor } from "./use-forecast-editor";

import { ForecastPlot } from "@/components/dispatch-chart";
import { parseForecast } from "@/lib/forecast-parser";
import { DialogActions } from "./dialog";

import { clock } from "./workspace-format";
import type { Draft } from "./workspace-types";

/** Temporary interval edits are only committed after server validation. */
export function ForecastEditor({
  draft,
  apply,
  cancel,
}: {
  draft: Draft;
  apply: (prices: string[]) => void;
  cancel: () => void;
}) {
  const { prices, setPrices, validating, paste, setPaste, error, setError, invalid, submit } =
    useForecastEditor(draft, apply);
  return (
    <>
      <p>
        Day-Ahead forecast · €/MWh · {draft.market.timezone}. Changes are staged until you apply
        them.
      </p>
      <ForecastPlot
        points={draft.points.map((p, i) => ({
          ...p,
          price_eur_mwh:
            prices[i]?.trim() && Number.isFinite(Number(prices[i])) ? Number(prices[i]) : null,
        }))}
        zone={draft.market.timezone}
      />
      <details>
        <summary>Paste prices</summary>
        <p>
          One price per line, or HH:mm;price. For repeated DST hours use ISO timestamps with
          offsets.
        </p>
        <label>
          Paste prices
          <textarea
            name="manual-forecast-paste"
            disabled={validating}
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
              draft.market.timezone,
            );
            if (parsed.errors.length) setError(parsed.errors.map((e) => e.message).join(" "));
            else {
              setPrices(parsed.values.map(String));
              setError("");
            }
          }}
        >
          Use pasted prices
        </button>
      </details>
      <div className="ws-price-grid">
        {draft.points.map((p, i) => (
          <label key={p.timestamp_utc}>
            {clock(p.timestamp_utc, draft.market.timezone)}{" "}
            <small
              className={
                draft.points.filter(
                  (point) =>
                    clock(point.timestamp_utc, draft.market.timezone) ===
                    clock(p.timestamp_utc, draft.market.timezone),
                ).length > 1
                  ? "ws-time-evidence"
                  : "sr-only"
              }
            >
              {new Date(p.timestamp_utc).toISOString().slice(11, 16)} UTC
            </small>
            <input
              aria-label={`Price ${p.timestamp_utc}`}
              name={`price-${i}`}
              disabled={validating}
              autoComplete="off"
              inputMode="decimal"
              aria-invalid={
                !prices[i]?.trim() ||
                !Number.isFinite(Number(prices[i])) ||
                Number(prices[i]) < draft.market.min_price_eur_mwh ||
                Number(prices[i]) > draft.market.max_price_eur_mwh
              }
              aria-describedby={`price-bounds-${i}`}
              type="number"
              step="any"
              value={prices[i]}
              onChange={(e) => setPrices((x) => x.map((v, j) => (i === j ? e.target.value : v)))}
            />
            <small
              id={`price-bounds-${i}`}
              className={
                !prices[i]?.trim() ||
                !Number.isFinite(Number(prices[i])) ||
                Number(prices[i]) < draft.market.min_price_eur_mwh ||
                Number(prices[i]) > draft.market.max_price_eur_mwh
                  ? "field-error"
                  : "sr-only"
              }
            >
              Required: {draft.market.min_price_eur_mwh} to {draft.market.max_price_eur_mwh} €/MWh
            </small>
          </label>
        ))}
      </div>
      {invalid && (
        <p className="field-error">
          Enter every price within configured bounds; blank is not zero.
        </p>
      )}
      <DialogActions>
        <span role="status">
          {
            prices.filter(
              (p) =>
                p.trim() &&
                Number.isFinite(Number(p)) &&
                Number(p) >= draft.market.min_price_eur_mwh &&
                Number(p) <= draft.market.max_price_eur_mwh,
            ).length
          }
          /{draft.points.length} valid
        </span>
        {error && (
          <span role="alert" className="field-error">
            {error}
          </span>
        )}
        <button className="secondary" onClick={cancel}>
          Cancel
        </button>
        {invalid && (
          <button
            className="ws-text-button"
            onClick={(event) =>
              event.currentTarget
                .closest("dialog")
                ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
                ?.focus()
            }
          >
            Review invalid prices
          </button>
        )}
        <button className="primary" disabled={invalid || validating} onClick={submit}>
          {validating ? "Validating…" : "Apply prices"}
        </button>
      </DialogActions>
    </>
  );
}
