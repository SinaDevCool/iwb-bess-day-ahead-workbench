"use client";
import { api } from "@/lib/api";
import { validateBattery } from "@/lib/order-simulation-validation";
import type { Battery } from "@/types/api";
import { useState } from "react";
import { BATTERY_FIELDS } from "./battery-fields";
import type { Draft } from "./workspace-types";
/** Reset and edits are staged; only the view's Apply callback changes the case. */
export function useBatteryEditor(draft: Draft) {
  const [resetError, setResetError] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [raw, setRaw] = useState(
    Object.fromEntries(BATTERY_FIELDS.map(([k]) => [k, String(draft.battery[k])])),
  );
  const [unavailable, setUnavailable] = useState(draft.battery.unavailable_intervals);
  const b = {
    ...draft.battery,
    ...Object.fromEntries(BATTERY_FIELDS.map(([k]) => [k, raw[k]?.trim() ? Number(raw[k]) : NaN])),
    unavailable_intervals: unavailable,
  };
  const issues = validateBattery(b);
  const reset = () => {
    if (!resetRequested) {
      setResetRequested(true);
      return;
    }
    setResetPending(true);
    setResetError("");
    void api<{ battery: Battery }>("/api/configuration")
      .then((x) => {
        setRaw(Object.fromEntries(BATTERY_FIELDS.map(([k]) => [k, String(x.battery[k])])));
        setUnavailable([]);
      })
      .catch((e) =>
        setResetError(e instanceof Error ? e.message : "Could not load baseline. Try again."),
      )
      .finally(() => {
        setResetPending(false);
        setResetRequested(false);
      });
  };
  return {
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
  };
}
