"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SubmittedOrder } from "@/types/api";
import type { Draft } from "./workspace-types";
import { identity, orderRequest } from "./workspace-adapters";

export type RepairPreview = {
  input_hash: string;
  status: "ready" | "unchanged" | "blocked" | "timeout" | "error";
  message: string;
  orders: SubmittedOrder[];
  issues: { code: string; message: string; existing_orders: SubmittedOrder[] }[];
};
export function usePortfolioRepair(draft: Draft) {
  const [snapshot] = useState(draft);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [additions, setAdditions] = useState(true);
  const [preview, setPreview] = useState<RepairPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const applied = useRef(false);
  const current = useRef(draft);
  useEffect(() => {
    current.current = draft;
  }, [draft]);
  const stale = identity(snapshot) !== identity(draft);
  const body = {
    baseline: orderRequest(snapshot),
    allow_revision_ids: allowed,
    keep_original_ids: kept,
    allow_additions: additions,
  };
  function invalidate() {
    sequence.current++;
    setPreview(undefined);
    setError("");
  }
  async function calculate() {
    if (busy || stale) return;
    const ticket = ++sequence.current;
    setBusy(true);
    setPreview(undefined);
    setError("");
    try {
      const next = await api<RepairPreview>("/api/order-suggestions/repair", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (ticket === sequence.current) setPreview(next);
    } catch (e) {
      if (ticket === sequence.current) setError(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setBusy(false);
    }
  }
  async function apply(done: (orders: SubmittedOrder[]) => void) {
    if (busy || stale || applied.current || preview?.status !== "ready") return;
    applied.current = true;
    setBusy(true);
    setError("");
    try {
      const checked = await api<RepairPreview>("/api/order-suggestions/repair/validate", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          input_hash: preview.input_hash,
          proposed_orders: preview.orders,
        }),
      });
      if (identity(current.current) !== identity(snapshot))
        throw new Error("Inputs changed. Reopen the repair preview.");
      done(checked.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
      applied.current = false;
    } finally {
      setBusy(false);
    }
  }
  return {
    snapshot,
    allowed,
    kept,
    additions,
    preview,
    busy,
    error,
    stale,
    calculate,
    apply,
    allow: (id: string, enabled: boolean) => {
      invalidate();
      setAllowed(enabled ? [...allowed, id] : allowed.filter((o) => o !== id));
    },
    keep: (id: string, enabled: boolean) => {
      invalidate();
      setKept(enabled ? [...kept, id] : kept.filter((o) => o !== id));
    },
    add: (enabled: boolean) => {
      invalidate();
      setAdditions(enabled);
    },
  };
}
