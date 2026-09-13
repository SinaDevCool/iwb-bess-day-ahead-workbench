"use client";
import { ForecastPlot } from "@/components/dispatch-chart";
import type { ForecastPoint } from "@/types/forecast";
import { DialogActions } from "./dialog";
import { useForecastLoader, type ForecastPreview } from "./use-forecast-loader";
type Point = ForecastPoint;
type Preview = ForecastPreview;

export function ForecastLoader({
  date,
  minutes,
  points,
  apply,
  cancel,
}: {
  date: string;
  minutes: number;
  points: Point[];
  apply: (preview: Preview) => void;
  cancel: () => void;
}) {
  const { preview, error, busy, filename, pasted, setPasted, providers, upload, template, demo } =
    useForecastLoader(date, minutes, points);
  return (
    <div className="forecast-loader">
      <p>
        CH · {date} · {minutes}-minute intervals · €/MWh. Load a complete forecast, then adjust
        individual intervals if needed.
      </p>
      <section className="forecast-upload">
        <h3>Upload forecast</h3>
        <p>
          UTF-8 CSV · delivery_start,price_eur_mwh · timestamps with UTC offset · decimal point.
        </p>
        <label>
          Choose CSV file
          <input
            name="forecast-file"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void upload(file);
            }}
          />
        </label>
        <button className="secondary" onClick={template}>
          Download blank template
        </button>
      </section>
      <details>
        <summary>Paste CSV data</summary>
        <label>
          Template-format CSV
          <textarea
            name="forecast-csv"
            spellCheck={false}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="delivery_start,price_eur_mwh…"
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !pasted.trim()}
          onClick={() =>
            void upload(new File([pasted], "pasted-forecast.csv", { type: "text/csv" }))
          }
        >
          Validate pasted forecast
        </button>
      </details>
      <details>
        <summary>Forecast providers</summary>
        <p>
          Commercial providers require credentials and confirmed CH forecast access. No automatic
          demo fallback.
        </p>
        {providers.map((p) => (
          <div className="provider-row" key={p.id}>
            <span>{p.name}</span>
            <button
              className="secondary"
              disabled={busy || !p.connected}
              onClick={() => void demo()}
            >
              {p.connected ? "Preview demo" : "Not connected"}
            </button>
          </div>
        ))}
      </details>
      {busy && <p role="status">Validating forecast…</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {preview && (
        <section>
          <h3>{filename}</h3>
          <p>
            {preview.points.length}/{points.length} intervals validated · changes not yet applied
          </p>
          <ForecastPlot points={preview.points} />
        </section>
      )}
      <DialogActions>
        <span>{preview ? `${preview.points.length} intervals ready` : "No forecast applied"}</span>
        <button className="secondary" onClick={cancel}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!preview || busy}
          onClick={() => preview && apply(preview)}
        >
          Apply forecast
        </button>
      </DialogActions>
    </div>
  );
}
