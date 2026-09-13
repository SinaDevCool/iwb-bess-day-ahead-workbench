"use client";

import { api } from "@/lib/api";
import type { OrderSimulation } from "@/types/api";

import type { ActionContext } from "./workspace-action-types";
import { calculationIdentity, requestBody } from "./workspace-adapters";
type SimulationActionContext = Pick<
  ActionContext,
  | "draft"
  | "setResult"
  | "setResultKey"
  | "setBusy"
  | "setError"
  | "setNotice"
  | "requestId"
  | "navigate"
  | "validate"
>;
/** simulation actions preserve explicit snapshots; they never recompute financial results in the UI. */
export function useSimulationActions(context: SimulationActionContext) {
  const {
    draft,
    setResult,
    setResultKey,
    setBusy,
    setError,
    setNotice,
    requestId,
    navigate,
    validate,
  } = context;
  const simulate = async () => {
    if (!draft) return;
    if (!draft.orders.length) {
      setError(
        "Add at least one Market or Limit order before simulating. A forecast alone does not create battery orders.",
      );
      navigate("orders");
      return;
    }
    if (!validate()) return;
    const snapshot = draft,
      key = calculationIdentity(snapshot),
      ticket = ++requestId.current;
    setBusy("Simulating");
    setError("");
    try {
      const next = await api<OrderSimulation>("/api/order-simulations", {
        method: "POST",
        body: JSON.stringify({
          ...requestBody(snapshot),
          source_proposal_id: snapshot.sourceProposalId,
          orders: snapshot.orders.map((o) => ({
            client_order_id: o.id,
            delivery_start_utc: snapshot.points[o.interval].timestamp_utc,
            side: o.side,
            order_type: o.orderType,
            volume_mw: Number(o.volume),
            limit_price_eur_mwh: o.orderType === "LIMIT" ? Number(o.limit) : null,
          })),
        }),
      });
      if (ticket === requestId.current) {
        setResult(next);
        setResultKey(key);
        setNotice("");
        navigate("schedule");
      }
    } catch (e) {
      if (ticket === requestId.current)
        setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      if (ticket === requestId.current) setBusy("");
    }
  };
  return { simulate };
}
