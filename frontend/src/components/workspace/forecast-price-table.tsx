import type { RefObject } from "react";
import { intervalTime, dateText } from "@/lib/time-presentation";
import { num } from "./workspace-format";
import type { Draft } from "./workspace-types";
import type { useForecastEditor } from "./use-forecast-editor";

/** Presentation only: the editor hook owns every staged value. */
export function ForecastPriceTable({
  draft,
  editor,
  zone,
  onlyChanged,
  selected,
  select,
  inputs,
}: {
  draft: Draft;
  editor: ReturnType<typeof useForecastEditor>;
  zone: string;
  onlyChanged: boolean;
  selected?: string;
  select: (timestamp: string) => void;
  inputs: RefObject<Record<string, HTMLInputElement | null>>;
}) {
  const { prices, setPrices, baseline, opening, changed, validating, valid } = editor;
  return (
    <div className="forecast-price-scroll">
      <table className="forecast-price-table">
        <caption className="sr-only">
          Edit interval prices; all values in euros per megawatt-hour
        </caption>
        <thead>
          <tr>
            <th>Delivery</th>
            <th>{editor.hasSource ? "Original" : "Before editing"}</th>
            <th>Edited price</th>
            <th>Change</th>
            <th>Undo</th>
          </tr>
        </thead>
        <tbody>
          {draft.points.map((point, index) => {
            if (onlyChanged && !changed(index)) return null;
            const good = valid(prices[index]);
            const baselineValid =
              baseline[index]?.trim() && Number.isFinite(Number(baseline[index]));
            const delta =
              good && baselineValid ? Number(prices[index]) - Number(baseline[index]) : null;
            const label = intervalTime(point.timestamp_utc, zone);
            return (
              <tr
                key={point.timestamp_utc}
                data-adjusted={Boolean(changed(index))}
                className={selected === point.timestamp_utc ? "selected" : ""}
              >
                <th scope="row">
                  <label htmlFor={`forecast-price-${index}`}>{label}</label>
                  <small>{dateText(point.timestamp_utc, zone)}</small>
                </th>
                <td>{baselineValid ? num(Number(baseline[index]), 2) : "—"}</td>
                <td>
                  <input
                    id={`forecast-price-${index}`}
                    ref={(node) => {
                      inputs.current[point.timestamp_utc] = node;
                    }}
                    name={`price-${index}`}
                    aria-label={`Price ${label}`}
                    autoComplete="off"
                    inputMode="decimal"
                    type="number"
                    step="any"
                    value={prices[index]}
                    disabled={validating}
                    aria-invalid={!good}
                    aria-describedby={!good ? `forecast-error-${index}` : undefined}
                    onFocus={() => select(point.timestamp_utc)}
                    onChange={(event) =>
                      setPrices((values) =>
                        values.map((value, i) => (i === index ? event.target.value : value)),
                      )
                    }
                  />
                  {!good && (
                    <small id={`forecast-error-${index}`} className="field-error">
                      Required: {draft.market.min_price_eur_mwh} to {draft.market.max_price_eur_mwh}
                    </small>
                  )}
                </td>
                <td>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${num(delta, 2)}`}</td>
                <td>
                  <button
                    className="ws-text-button"
                    disabled={validating || prices[index] === opening[index]}
                    aria-label={`Undo edit ${label}`}
                    onClick={() =>
                      setPrices((values) =>
                        values.map((value, i) => (i === index ? opening[index] : value)),
                      )
                    }
                  >
                    Undo
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {onlyChanged && !prices.some((_, index) => changed(index)) && (
        <p className="ws-empty">No adjusted intervals.</p>
      )}
    </div>
  );
}
