"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SubmittedOrder } from "@/types/api";
import { identity, orderRequest } from "./workspace-adapters";
import type { Draft } from "./workspace-types";
import { revisionBaseline } from "./suggestion-revision";
import type { RepairPreview } from "./use-portfolio-repair";
import { deliveryLabel } from "./order-presentation";
import { useDisplayTimezone } from "./time-preference";

import type { SelectionResult } from "./suggestion-checks";
export type { SelectionResult } from "./suggestion-checks";
type Preview = { input_hash: string; orders: SubmittedOrder[]; validation: SelectionResult };

/** Preview state only. Abort and sequence guards prevent stale async selection results. */
export function useOrderSuggestions(draft: Draft, replacing = false) {
  const zone = useDisplayTimezone();
  const [snapshot] = useState(draft);
  const baseline = useMemo(
    () => (replacing ? revisionBaseline(snapshot) : snapshot),
    [snapshot, replacing],
  );
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState<{ key: string; result: SelectionResult }>();
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(true);
  const [applying, setApplying] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [adjustments, setAdjustments] = useState<string[]>([]);
  const [rebalanceError, setRebalanceError] = useState("");
  const sequence = useRef(0);
  const applied = useRef(false);
  const current = useRef(draft);
  useEffect(() => {
    current.current = draft;
  }, [draft]);
  const stale = identity(snapshot) !== identity(draft);
  const key = JSON.stringify(selected);
  // Feasibility belongs to this selection: removing a trade can break later SoC.
  const result = !stale && !error && checked?.key === key ? checked.result : undefined;
  const chosen = preview?.orders.filter((o) => selected.includes(o.client_order_id)) ?? [];
  const validationBody = () => ({
    baseline: orderRequest(baseline),
    input_hash: preview!.input_hash,
    selected_orders: chosen,
  });

  useEffect(() => {
    const controller = new AbortController();
    api<Preview>("/api/order-suggestions", {
      method: "POST",
      body: JSON.stringify(orderRequest(baseline)),
      signal: controller.signal,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
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
  }, [baseline, attempt]);

  useEffect(() => {
    if (!preview || stale || rebalancing) return;
    const ticket = ++sequence.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<SelectionResult>("/api/order-suggestions/validate", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          baseline: orderRequest(baseline),
          input_hash: preview.input_hash,
          selected_orders: preview.orders.filter((o) => selected.includes(o.client_order_id)),
        }),
      })
        .then((next) => {
          if (!controller.signal.aborted && ticket === sequence.current) {
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
  }, [preview, selected, key, baseline, stale, rebalancing]);

  async function rebalance() {
    // Revise only selected suggestions; baseline orders stay fixed and additions
    // are disabled, so deselected trades cannot silently reappear.
    if (!preview || stale || rebalancing || applying || !chosen.length) return;
    setRebalancing(true);
    setRebalanceError("");
    setError("");
    try {
      const original = orderRequest(baseline);
      const repaired = await api<RepairPreview>("/api/order-suggestions/repair", {
        method: "POST",
        body: JSON.stringify({
          baseline: { ...original, orders: [...original.orders, ...chosen] },
          keep_original_ids: original.orders.map((o) => o.client_order_id),
          allow_revision_ids: chosen.map((o) => o.client_order_id),
          allow_additions: false,
        }),
      });
      if (identity(current.current) !== identity(snapshot))
        throw new Error("Inputs changed. Reopen suggestions.");
      if (repaired.status !== "ready" && repaired.status !== "unchanged")
        throw new Error(repaired.message);
      const revised = repaired.orders.filter((o) => selected.includes(o.client_order_id));
      const nextOrders = preview.orders.map(
        (o) => revised.find((r) => r.client_order_id === o.client_order_id) ?? o,
      );
      setAdjustments(
        chosen.flatMap((o) => {
          const volume =
            revised.find((r) => r.client_order_id === o.client_order_id)?.volume_mw ?? 0;
          return volume === o.volume_mw
            ? []
            : [
                `${deliveryLabel(o.delivery_start_utc, baseline.market.product_minutes, zone)} ${o.side}: ${o.volume_mw} → ${volume} MW`,
              ];
        }),
      );
      setChecked(undefined);
      setPreview({ ...preview, orders: nextOrders });
      setSelected(revised.map((o) => o.client_order_id));
    } catch (e) {
      setRebalanceError(e instanceof Error ? e.message : "Rebalancing failed");
    } finally {
      setRebalancing(false);
    }
  }
  async function accept(add: (orders: SubmittedOrder[]) => void) {
    if (
      rebalancing ||
      applied.current ||
      stale ||
      (!replacing && !chosen.length) ||
      !result?.feasible
    )
      return;
    applied.current = true;
    setApplying(true);
    try {
      // Revalidate the exact selection before applying it to the shared draft.
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
  const retry = () => {
    setPreview(undefined);
    setChecked(undefined);
    setError("");
    setGenerating(true);
    setAttempt((n) => n + 1);
  };
  return {
    preview,
    selected,
    setSelected,
    result,
    error: error || rebalanceError,
    generating,
    applying,
    rebalancing,
    rebalance,
    adjustments,
    stale,
    accept,
    retry,
  };
}
