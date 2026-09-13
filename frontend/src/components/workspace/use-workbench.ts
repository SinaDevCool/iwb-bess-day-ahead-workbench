"use client";

import { validateBattery, validateOrders } from "@/lib/order-simulation-validation";
import { useMemo } from "react";
import { patchDraft } from "./workspace-draft";

import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { identity, requestBody } from "./workspace-adapters";
import { useProposalActions } from "./workspace-proposal-actions";
import { useReplacementActions } from "./workspace-replacement-actions";
import { useWorkspaceSession } from "./workspace-session";
import { useSimulationActions } from "./workspace-simulation-actions";
import { useWorkspaceState } from "./workspace-state";
import type { Draft } from "./workspace-types";
/** Compose state, validation and actions; components consume this single controller. */
export function useWorkbench() {
  const state = useWorkspaceState();
  const { draft, setDraft, resultKey, setSelected, setError, setNotice, setModal, errorRef } =
    state;
  const { navigate, selectComparison } = useWorkspaceNavigation(state);
  const dirty = Boolean(draft && resultKey !== identity(draft));
  const change = (patch: Partial<Draft>) => {
    setDraft((current) => patchDraft(current, patch));
    setError("");
    setNotice("");
  };
  const batteryIssues = useMemo(() => (draft ? validateBattery(draft.battery) : {}), [draft]);
  const orderIssues = useMemo(
    () =>
      draft ? validateOrders(draft.orders, draft.market, draft.battery, draft.points.length) : {},
    [draft],
  );
  const priceIssues =
    draft?.prices.map(
      (p) =>
        !p.trim() ||
        !Number.isFinite(Number(p)) ||
        Number(p) < draft.market.min_price_eur_mwh ||
        Number(p) > draft.market.max_price_eur_mwh,
    ) ?? [];
  const issues =
    Object.keys(batteryIssues).length +
    Object.keys(orderIssues).length +
    priceIssues.filter(Boolean).length;
  const validate = (includeOrders = true) => {
    const count = issues - (includeOrders ? 0 : Object.keys(orderIssues).length);
    if (count) {
      setError(`${count} input issue(s). Check highlighted fields.`);
      if (Object.keys(batteryIssues).length) setModal("battery");
      else if (priceIssues.some(Boolean)) setModal("forecast");
      else {
        setSelected(Object.keys(orderIssues)[0]?.split(".")[1] ?? "");
        navigate("orders");
      }
      setTimeout(() => errorRef.current?.focus(), 0);
      return false;
    }
    return true;
  };
  const context = { ...state, dirty, navigate, change, validate };
  const replacements = useReplacementActions(context);
  const simulation = useSimulationActions(context);
  const proposals = useProposalActions(context);
  useWorkspaceSession(state, replacements.load, dirty);
  return {
    ...state,
    ...replacements,
    ...simulation,
    ...proposals,
    navigate,
    selectComparison,
    dirty,
    change,
    batteryIssues,
    orderIssues,
    priceIssues,
    issues,
    validate,
    requestBody,
  };
}
export type Workbench = ReturnType<typeof useWorkbench>;
export type ReadyWorkbench = Workbench & { draft: Draft };
