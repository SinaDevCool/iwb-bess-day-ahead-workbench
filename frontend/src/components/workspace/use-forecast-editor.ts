"use client";
import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import type { Draft } from "./workspace-types";
/** Staged values reach the shared draft only after successful server validation. */
export function useForecastEditor(draft: Draft, apply: (prices: string[]) => void) {
  const [prices, setPrices] = useState(draft.prices);
  const [opening] = useState(() => [...draft.prices]);
  const hasSource = draft.forecast?.original_price_values?.length === draft.points.length;
  const baseline = hasSource ? draft.forecast!.original_price_values!.map(String) : opening;
  const changed = (index: number) =>
    prices[index]?.trim() && baseline[index]?.trim()
      ? Number(prices[index]) !== Number(baseline[index])
      : prices[index] !== baseline[index];
  const pending = prices.some((price, index) =>
    price.trim() && opening[index]?.trim()
      ? Number(price) !== Number(opening[index])
      : price !== opening[index],
  );
  const [validating, setValidating] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const validationActive = useRef(true);
  useEffect(() => {
    validationActive.current = true;
    return () => {
      validationActive.current = false;
    };
  }, []);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const valid = (p: string) =>
    Boolean(p?.trim()) &&
    Number.isFinite(Number(p)) &&
    Number(p) >= draft.market.min_price_eur_mwh &&
    Number(p) <= draft.market.max_price_eur_mwh;
  const invalid = prices.some((p) => !valid(p));
  const submit = async () => {
    setValidating(true);
    setError("");
    try {
      await api("/api/forecast/validate", {
        method: "POST",
        body: JSON.stringify({
          delivery_date: draft.date,
          market: draft.market,
          prices: draft.points.map((p, i) => ({
            ...p,
            price_eur_mwh: Number(prices[i]),
          })),
        }),
      });
      if (validationActive.current) apply(prices);
    } catch (e) {
      if (validationActive.current) setError(String(e));
    } finally {
      if (validationActive.current) setValidating(false);
    }
  };
  return {
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
  };
}
