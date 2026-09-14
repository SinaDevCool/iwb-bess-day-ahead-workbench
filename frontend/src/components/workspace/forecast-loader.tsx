"use client";
import { useEffect, useRef, useState } from "react";
import { ForecastPlot } from "@/components/dispatch-chart";
import type { Point } from "./workspace-types";
import { DialogActions } from "./dialog";
import { useForecastLoader, type ForecastPreview } from "./use-forecast-loader";
import { ForecastIssues } from "./forecast-issues";
import { ForecastSnapshot } from "./forecast-snapshot";
import type { ForecastMetadata } from "@/types/forecast";
import { ForecastSourceInput, type ForecastMethod } from "./forecast-source-input";

export function ForecastLoader({
  date,
  minutes,
  points,
  currentForecast,
  apply,
  cancel,
}: {
  date: string;
  minutes: number;
  points: Point[];
  currentForecast?: ForecastMetadata;
  apply: (preview: ForecastPreview) => void;
  cancel: () => void;
}) {
  const state = useForecastLoader(date, minutes, points);
  const [method, setMethod] = useState<ForecastMethod>("upload");
  const reviewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.preview) reviewRef.current?.focus();
  }, [state.preview]);
  return (
    <div className="forecast-loader">
      <p>
        {new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(
          new Date(date + "T00:00:00Z"),
        )}{" "}
        · {minutes}-minute prices · €/MWh
      </p>
      {!state.preview ? (
        <>
          <ForecastSnapshot forecast={currentForecast} simple />
          <ForecastSourceInput
            method={method}
            changeMethod={(next) => {
              state.reset();
              setMethod(next);
            }}
            state={state}
          />
          {state.busy && <p role="status">Validating forecast…</p>}
          <ForecastIssues message={state.error} issues={state.issues} />
        </>
      ) : (
        <section aria-label="Review price forecast" tabIndex={-1} ref={reviewRef}>
          <div className="forecast-review-heading">
            <h3>{state.filename || "Price forecast"}</h3>
            <span role="status">✓ Ready to use</span>
          </div>
          <ForecastPlot points={state.preview.points} />
          <ForecastSnapshot forecast={state.preview.forecast} preview simple />
          <p className="ws-help">Orders stay unchanged. Simulate again after applying.</p>
        </section>
      )}
      <DialogActions>
        {state.preview && (
          <button className="secondary" onClick={state.reset}>
            Choose another source
          </button>
        )}
        <button className="secondary" onClick={cancel}>
          Cancel
        </button>
        {state.preview && (
          <button
            className="primary"
            disabled={state.busy}
            onClick={() => {
              if (!state.busy && state.preview) apply(state.preview);
            }}
          >
            Apply forecast
          </button>
        )}
      </DialogActions>
    </div>
  );
}
