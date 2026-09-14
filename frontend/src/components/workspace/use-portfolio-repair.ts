"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SubmittedOrder } from "@/types/api";
import type { Draft } from "./workspace-types";
import { identity, orderRequest } from "./workspace-adapters";
import type { SelectionIssue } from "./suggestion-checks";

export type RepairIssue = Pick<SelectionIssue, "code" | "message" | "existing_orders"> &
  Partial<Omit<SelectionIssue, "code" | "message" | "existing_orders">> & {
    side?: "BUY" | "SELL" | null;
    required_revision_ids?: string[];
  };

export type RepairPreview = {
  input_hash: string;
  status: "ready" | "unchanged" | "blocked" | "timeout" | "error";
  message: string;
  orders: SubmittedOrder[];
  issues: RepairIssue[];
};
/** Preview against the opening draft; only validated Apply changes orders. */
export function usePortfolioRepair(draft: Draft) {
  // Freeze inputs; current below tracks intervening edits during async Apply.
  const [snapshot] = useState(draft);
  // Consent permits changes; keep-original overrides consent and default eligibility.
  const [allowed, setAllowed] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [additions, setAdditions] = useState(true);
  const [preview, setPreview] = useState<RepairPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<RepairIssue[]>([]);
  const [permissionsChanged, setPermissionsChanged] = useState(false);
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
    // Ignore obsolete responses, not backend work. Retain original diagnostics
    // while discarding a proposal whose permissions no longer match.
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
      if (ticket === sequence.current) {
        setPreview(next);
        setIssues(next.issues ?? []);
        setPermissionsChanged(false);
      }
    } catch (e) {
      if (ticket === sequence.current) setError(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setBusy(false);
    }
  }
  async function apply(done: (orders: SubmittedOrder[]) => void) {
    if (busy || stale || applied.current || preview?.status !== "ready") return;
    // Guard duplicate clicks before busy state renders; failure permits retry.
    applied.current = true;
    setBusy(true);
    setError("");
    try {
      // Recheck permissions/physics on the server, then reject intervening draft edits.
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
    issues,
    permissionsChanged,
    stale,
    calculate,
    apply,
    allow: (id: string, enabled: boolean) => {
      invalidate();
      setPermissionsChanged(true);
      setAllowed(enabled ? [...allowed, id] : allowed.filter((o) => o !== id));
      if (enabled) setKept(kept.filter((o) => o !== id));
    },
    keep: (id: string, enabled: boolean) => {
      invalidate();
      setPermissionsChanged(true);
      setKept(enabled ? [...kept, id] : kept.filter((o) => o !== id));
      if (enabled) setAllowed(allowed.filter((o) => o !== id));
    },
    add: (enabled: boolean) => {
      invalidate();
      setPermissionsChanged(true);
      setAdditions(enabled);
    },
  };
}
