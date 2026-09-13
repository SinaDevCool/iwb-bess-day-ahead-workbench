"use client";

import { validateBattery, validateOrders } from "@/lib/order-simulation-validation";
import { useMemo } from "react";
import { isInvalidPrice } from "@/lib/price-input";
import { patchDraft } from "./workspace-draft";

import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { calculationIdentity, requestBody } from "./workspace-adapters";
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
  const dirty = Boolean(draft && resultKey !== calculationIdentity(draft));
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
  const priceIssues = draft?.prices.map((price) => isInvalidPrice(price, draft.market)) ?? [];
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
  const showOrderOnSchedule = (orderId: string) => {
    if (!state.result || dirty) return;
    const order = state.result.order_results.find(
      (item) => item.submitted_order.client_order_id === orderId,
    );
    if (!order) return;
    state.setScheduleSelection({
      simulationId: state.result.simulation_id,
      timestamp: new Date(order.submitted_order.delivery_start_utc).toISOString(),
      orderId,
    });
    const url = new URL(location.href);
    url.searchParams.set("scheduleView", "overview");
    url.searchParams.set("inspectRun", state.result.simulation_id);
    url.searchParams.set("inspectOrder", orderId);
    url.searchParams.set(
      "inspectInterval",
      new Date(order.submitted_order.delivery_start_utc).toISOString(),
    );
    history.replaceState({}, "", url);
    navigate("schedule");
  };
  const editResultOrder = (orderId: string) => {
    if (dirty || !draft?.orders.some((order) => order.id === orderId)) return;
    setSelected(orderId);
    navigate("orders");
  };
  const context = { ...state, dirty, navigate, change, validate };
  const replacements = useReplacementActions(context);
  const simulation = useSimulationActions(context);
  const proposals = useProposalActions(context);
  useWorkspaceSession(state, replacements.load, dirty);
  return {
    ...state,
    showOrderOnSchedule,
    editResultOrder,
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
