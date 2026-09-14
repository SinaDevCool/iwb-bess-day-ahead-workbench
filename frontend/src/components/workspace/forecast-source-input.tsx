"use client";
import type { useForecastLoader } from "./use-forecast-loader";
export type ForecastMethod = "upload" | "paste" | "example";
export function ForecastSourceInput({
  method,
  changeMethod,
  state,
}: {
  method: ForecastMethod;
  changeMethod: (method: ForecastMethod) => void;
  state: ReturnType<typeof useForecastLoader>;
}) {
  return (
    <section aria-label="Choose forecast source">
      <div className="forecast-methods" role="group" aria-label="Input method">
        {(
          [
            ["upload", "Upload CSV"],
            ["paste", "Paste CSV"],
            ["example", "Example data"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="secondary"
            aria-pressed={method === value}
            onClick={() => changeMethod(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {method === "upload" && (
        <section className="forecast-upload">
          <label>
            Choose CSV file
            <input
              name="forecast-file"
              type="file"
              accept=".csv,text/csv"
              disabled={state.busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void state.upload(file);
              }}
            />
          </label>
          <p className="ws-help">CSV · up to 256 KB</p>
          {state.filename && <p className="forecast-filename">{state.filename}</p>}
        </section>
      )}
      {method === "paste" && (
        <section>
          <label>
            Paste forecast CSV
            <textarea
              name="forecast-csv"
              spellCheck={false}
              autoComplete="off"
              value={state.pasted}
              onChange={(e) => state.setPasted(e.target.value)}
              placeholder="delivery_start,price_eur_mwh…"
            />
          </label>
          <button
            className="secondary"
            disabled={state.busy || !state.pasted.trim()}
            onClick={() =>
              void state.upload(
                new File([state.pasted], "pasted-forecast.csv", { type: "text/csv" }),
              )
            }
          >
            Preview prices
          </button>
        </section>
      )}
      {method === "example" && (
        <section>
          <p>Illustrative prices—not a live forecast.</p>
          <button className="secondary" disabled={state.busy} onClick={() => void state.demo()}>
            Preview example
          </button>
        </section>
      )}
      {method !== "example" && (
        <div className="forecast-format">
          <button className="secondary small" disabled={state.busy} onClick={state.template}>
            Download template
          </button>
          <details>
            <summary>Format help</summary>
            <p>
              Use a UTF-8 CSV with columns <code>delivery_start</code> and{" "}
              <code>price_eur_mwh</code>. Include a UTC offset in each timestamp and use a decimal
              point for prices.
            </p>
            <p>Fill every interval for this delivery day. Zero and negative prices are valid.</p>
            <button
              className="secondary small"
              disabled={state.busy}
              onClick={() => void state.demo(true)}
            >
              Download example CSV
            </button>
          </details>
        </div>
      )}
    </section>
  );
}
