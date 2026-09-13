"use client";
import { AvailabilityEditor } from "./availability-editor";
import { BATTERY_FIELDS } from "./battery-fields";
import { useBatteryEditor } from "./use-battery-editor";

import { DialogActions } from "./dialog";

import type { Draft } from "./workspace-types";

/** Local form values do not replace the shared draft until Apply. */
export function BatteryEditor({
  draft,
  apply,
  cancel,
}: {
  draft: Draft;
  apply: (patch: Partial<Draft>) => void;
  cancel: () => void;
}) {
  const {
    resetError,
    resetPending,
    resetRequested,
    setResetRequested,
    raw,
    setRaw,
    unavailable,
    setUnavailable,
    b,
    issues,
    reset,
  } = useBatteryEditor(draft);
  return (
    <>
      <p>
        Task baseline: 100 MWh / 50 MW. Two hours is interpreted as nominal charge or discharge
        duration, not a waiting period. Other values are assumptions. Ramp limits are not modeled.
        Changes are staged; Cancel discards them.
      </p>
      {[
        {
          title: "Battery & connection",
          keys: [
            "capacity_mwh",
            "max_charge_power_mw",
            "max_discharge_power_mw",
            "grid_limit_mw",
            "round_trip_efficiency",
          ],
        },
        {
          title: "Operating limits",
          keys: [
            "initial_soc_mwh",
            "min_soc_mwh",
            "max_soc_mwh",
            "target_soc_mwh",
            "max_equivalent_cycles",
          ],
        },
        {
          title: "Battery wear cost",
          keys: ["degradation_cost_eur_per_mwh"],
        },
      ].map((group) => (
        <fieldset className="ws-field-group" key={group.title}>
          <legend>{group.title}</legend>
          <div className="ws-fields">
            {BATTERY_FIELDS.filter(([key]) => group.keys.includes(key)).map(
              ([key, label, unit]) => (
                <label key={key}>
                  {label} <small>{key === "round_trip_efficiency" ? "%" : unit}</small>
                  <input
                    type="number"
                    step="any"
                    value={
                      key === "round_trip_efficiency" && raw[key]?.trim()
                        ? Number((Number(raw[key]) * 100).toFixed(8))
                        : raw[key]
                    }
                    name={key}
                    autoComplete="off"
                    aria-label={`${label} ${key === "round_trip_efficiency" ? "%" : unit}`}
                    aria-describedby={issues[key] ? `battery-error-${key}` : undefined}
                    disabled={resetPending}
                    aria-invalid={Boolean(issues[key])}
                    onChange={(e) =>
                      setRaw((x) => ({
                        ...x,
                        [key]:
                          key === "round_trip_efficiency" && e.target.value.trim()
                            ? String(Number(e.target.value) / 100)
                            : e.target.value,
                      }))
                    }
                  />
                  {issues[key] && (
                    <small id={`battery-error-${key}`} className="field-error">
                      {issues[key]}
                    </small>
                  )}
                </label>
              ),
            )}
          </div>
        </fieldset>
      ))}
      <AvailabilityEditor
        points={draft.points}
        zone={draft.market.timezone}
        unavailable={unavailable}
        setUnavailable={setUnavailable}
      />
      <DialogActions>
        <span>Apply to draft · re-simulate to update results</span>
        <button className="secondary" onClick={cancel} disabled={resetPending}>
          Cancel
        </button>
        {Object.keys(issues).length > 0 && (
          <button
            className="ws-text-button"
            onClick={(event) =>
              event.currentTarget
                .closest("dialog")
                ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
                ?.focus()
            }
          >
            Review invalid settings
          </button>
        )}
        <button
          className="primary"
          disabled={Object.keys(issues).length > 0 || resetPending}
          onClick={() =>
            apply({
              battery: b,
            })
          }
        >
          Apply settings
        </button>
      </DialogActions>
      {resetError && (
        <p role="alert" className="field-error">
          {resetError}
        </p>
      )}
      <button className="secondary" disabled={resetPending} onClick={reset}>
        {resetPending
          ? "Restoring baseline…"
          : resetRequested
            ? "Restore baseline in editor"
            : "Reset battery assumptions"}
      </button>
      {resetRequested && !resetPending && (
        <p role="status">
          This replaces the staged battery values. Nothing is applied until you choose Apply
          settings.{" "}
          <button className="ws-text-button" onClick={() => setResetRequested(false)}>
            Cancel reset
          </button>
        </p>
      )}
    </>
  );
}
