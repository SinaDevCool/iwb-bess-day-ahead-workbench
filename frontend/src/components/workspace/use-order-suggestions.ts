"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SubmittedOrder } from "@/types/api";
import { identity, orderRequest } from "./workspace-adapters";
import type { Draft } from "./workspace-types";

import type { SelectionResult } from "./suggestion-checks";
export type { SelectionResult } from "./suggestion-checks";
type Preview = { input_hash: string; orders: SubmittedOrder[]; validation: SelectionResult };

/** Preview state only. Abort and sequence guards prevent stale async selection results. */
export function useOrderSuggestions(draft: Draft) {
  const [snapshot] = useState(draft);
  const [preview, setPreview] = useState<Preview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState<{ key: string; result: SelectionResult }>();
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(true);
  const [applying, setApplying] = useState(false);
  const sequence = useRef(0);
  const applied = useRef(false);
  const current = useRef(draft);
  useEffect(() => {
    current.current = draft;
  }, [draft]);
  const stale = identity(snapshot) !== identity(draft);
  const key = JSON.stringify(selected);
  const result = !stale && !error && checked?.key === key ? checked.result : undefined;
  const chosen = preview?.orders.filter((o) => selected.includes(o.client_order_id)) ?? [];
  const validationBody = () => ({
    baseline: orderRequest(snapshot),
    input_hash: preview!.input_hash,
    selected_orders: chosen,
  });

  useEffect(() => {
    const controller = new AbortController();
    api<Preview>("/api/order-suggestions", {
      method: "POST",
      body: JSON.stringify(orderRequest(snapshot)),
      signal: controller.signal,
    })
      .then((next) => {
        setPreview(next);
        const ids = next.orders.map((o) => o.client_order_id);
        setSelected(ids);
        setChecked({ key: JSON.stringify(ids), result: next.validation });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGenerating(false);
      });
    return () => controller.abort();
  }, [snapshot]);

  useEffect(() => {
    if (!preview || stale) return;
    const ticket = ++sequence.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<SelectionResult>("/api/order-suggestions/validate", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          baseline: orderRequest(snapshot),
          input_hash: preview.input_hash,
          selected_orders: preview.orders.filter((o) => selected.includes(o.client_order_id)),
        }),
      })
        .then((next) => {
          if (ticket === sequence.current) {
            setError("");
            setChecked({ key, result: next });
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [preview, selected, key, snapshot, stale]);

  async function accept(add: (orders: SubmittedOrder[]) => void) {
    if (applied.current || stale || !chosen.length || !result?.feasible) return;
    applied.current = true;
    setApplying(true);
    try {
      const final = await api<SelectionResult>("/api/order-suggestions/validate", {
        method: "POST",
        body: JSON.stringify(validationBody()),
      });
      if (identity(current.current) !== identity(snapshot))
        throw new Error("Inputs changed. Close and generate new suggestions.");
      if (!final.feasible) throw new Error(final.issues.join(" "));
      add(chosen);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
      applied.current = false;
    } finally {
      setApplying(false);
    }
  }
  return { preview, selected, setSelected, result, error, generating, applying, stale, accept };
}
