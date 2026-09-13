"use client";
import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import type { Draft } from "./workspace-types";
/** Staged values reach the shared draft only after successful server validation. */
export function useForecastEditor(draft: Draft, apply: (prices: string[]) => void) {
  const [prices, setPrices] = useState(draft.prices);
  const [validating, setValidating] = useState(false);
  const validationActive = useRef(true);
  useEffect(() => {
    validationActive.current = true;
    return () => {
      validationActive.current = false;
    };
  }, []);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const invalid = prices.some(
    (p) =>
      !p.trim() ||
      !Number.isFinite(Number(p)) ||
      Number(p) < draft.market.min_price_eur_mwh ||
      Number(p) > draft.market.max_price_eur_mwh,
  );
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
  return { prices, setPrices, validating, paste, setPaste, error, setError, invalid, submit };
}
