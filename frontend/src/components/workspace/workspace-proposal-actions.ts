"use client";

import { api } from "@/lib/api";
import type { Simulation } from "@/types/api";

import type { ActionContext } from "./workspace-action-types";
import { fromOrders, identity, requestBody } from "./workspace-adapters";
import type { Preview } from "./workspace-types";
type ProposalActionContext = Pick<
  ActionContext,
  | "draft"
  | "setSelected"
  | "setBusy"
  | "setError"
  | "setNotice"
  | "setModal"
  | "preview"
  | "setPreview"
  | "previewKey"
  | "setPreviewKey"
  | "proposal"
  | "setProposal"
  | "setUndo"
  | "risk"
  | "horizon"
  | "terminal"
  | "weights"
  | "lookahead"
  | "navigate"
  | "change"
  | "validate"
>;
/** proposal actions preserve explicit snapshots; they never recompute financial results in the UI. */
export function useProposalActions(context: ProposalActionContext) {
  const {
    draft,
    setSelected,
    setBusy,
    setError,
    setNotice,
    setModal,
    preview,
    setPreview,
    previewKey,
    setPreviewKey,
    proposal,
    setProposal,
    setUndo,
    risk,
    horizon,
    terminal,
    weights,
    lookahead,
    navigate,
    change,
    validate,
  } = context;
  const generate = async () => {
    if (!draft || !validate(false)) return;
    const w = weights.map(Number);
    // Report the failing setting, not unrelated requirements from other policies.
    const policyError = w.some(
      (n, i) => !weights[i].trim() || !Number.isFinite(n) || n < 0 || n > 100,
    )
      ? "Each scenario probability must be between 0% and 100%."
      : Math.abs(w.reduce((a, b) => a + b, 0) - 100) > 1e-6
        ? `Scenario probabilities total ${w.reduce((a, b) => a + b, 0)}%; they must total 100%.`
        : horizon === "terminal_value" &&
            (!terminal.trim() || !Number.isFinite(Number(terminal)) || Number(terminal) < 0)
          ? "Terminal value must be a finite number of zero or more €/MWh."
          : ["next_day_proxy", "multi_day"].includes(horizon) &&
              (!Number.isInteger(Number(lookahead)) ||
                Number(lookahead) < 1 ||
                Number(lookahead) > 24)
            ? "Lookahead must be a whole number from 1 to 24 hours."
            : "";
    if (policyError) {
      setError(`${policyError} Close this preview and update Optimization Settings.`);
      return;
    }
    const snapshot = draft;
    setBusy("Generating");
    setError("");
    try {
      const next = await api<Preview>("/api/proposal-preview", {
        method: "POST",
        body: JSON.stringify({
          ...requestBody(snapshot),
          risk_posture: risk,
          horizon_policy: horizon,
          terminal_value_eur_per_mwh: horizon === "terminal_value" ? Number(terminal) : 0,
          lookahead_hours: ["next_day_proxy", "multi_day"].includes(horizon)
            ? Number(lookahead)
            : 4,
          scenario_probabilities: {
            downside: w[0] / 100,
            expected: w[1] / 100,
            upside: w[2] / 100,
          },
        }),
      });
      setPreview(next);
      setPreviewKey(identity(snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposal failed");
    } finally {
      setBusy("");
    }
  };
  const apply = () => {
    if (!draft || !preview) return;
    if (identity(draft) !== previewKey) {
      setError("Inputs changed. Generate a new proposal before applying it.");
      return;
    }
    setUndo(draft);
    change({
      orders: fromOrders(preview.orders, draft.points),
      sourceProposalId: preview.proposal.simulation_id,
    });
    setProposal(preview.proposal);
    setSelected(preview.orders[0]?.client_order_id ?? "");
    setModal(null);
    navigate("orders");
    setNotice("Proposal applied to the editable order list. Simulate to evaluate these orders.");
  };
  const sensitivity = async () => {
    if (!proposal) return;
    setBusy("Calculating sensitivities");
    try {
      const snapshot = proposal;
      const next = await api<{
        items: NonNullable<Simulation["sensitivities"]>;
      }>(`/api/simulations/${snapshot.simulation_id}/sensitivities`, {
        method: "POST",
      });
      setProposal((current) =>
        current?.simulation_id === snapshot.simulation_id
          ? { ...current, sensitivities: next.items }
          : current,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  return { generate, apply, sensitivity };
}
