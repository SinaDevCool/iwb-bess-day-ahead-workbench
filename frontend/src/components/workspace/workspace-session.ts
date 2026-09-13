"use client";

import { workspaceView } from "@/lib/workspace-navigation";
import { useEffect } from "react";

import { readPreference, writePreference } from "@/lib/session-preferences";
import type { WorkspaceState } from "./workspace-state";
const STORAGE = "iwb-order-workspace-v2";
/** Session storage is a recoverable convenience, not the authoritative backend history. */
export function useWorkspaceSession(
  context: WorkspaceState,
  load: () => Promise<void>,
  dirty: boolean,
) {
  const {
    draft,
    setDraft,
    result,
    setResult,
    resultKey,
    setResultKey,
    setView,
    setModal,
    proposal,
    setProposal,
    risk,
    setRisk,
    horizon,
    setHorizon,
    terminal,
    setTerminal,
    weights,
    setWeights,
    lookahead,
    setLookahead,
    setConfigurationOpen,
    setComparisonKind,
  } = context;
  useEffect(() => {
    const restoreView = () => {
      const params = new URLSearchParams(location.search);
      setView(workspaceView(params));
      setComparisonKind(
        params.get("comparison") === "simulations"
          ? "simulations"
          : params.get("comparison") === "proposals" ||
              params.has("runs") ||
              params.get("workspace") === "analysis"
            ? "proposals"
            : "simulations",
      );
      if (params.get("workspace") === "history") setModal("history");
    };
    addEventListener("popstate", restoreView);
    const timer = setTimeout(() => {
      if (window.matchMedia?.("(max-width: 850px)").matches) setConfigurationOpen(false);
      restoreView();
      let restored = false;
      try {
        const saved = readPreference(STORAGE) as {
          draft?: import("./workspace-types").Draft;
          result?: typeof result;
          resultKey?: string;
          proposal?: typeof proposal;
          policy?: {
            risk?: string;
            horizon?: string;
            terminal?: string;
            weights?: string[];
            lookahead?: string;
          };
        } | null;
        if (
          saved?.draft?.battery &&
          saved.draft.market &&
          Array.isArray(saved.draft.orders) &&
          Array.isArray(saved.draft.points) &&
          saved.draft.points.length > 0 &&
          Array.isArray(saved.draft.prices) &&
          saved.draft.prices.length === saved.draft.points.length
        ) {
          setDraft(saved.draft);
          setResult(saved.result);
          setResultKey(saved.resultKey ?? "");
          setProposal(saved.proposal);
          if (saved.policy) {
            setRisk(saved.policy.risk ?? "expected_value");
            setHorizon(saved.policy.horizon ?? "minimum_reserve");
            setTerminal(saved.policy.terminal ?? "55");
            setWeights(saved.policy.weights ?? ["20", "60", "20"]);
            setLookahead(saved.policy.lookahead ?? "4");
          }
          restored = true;
        }
      } catch {
        /* A corrupt local snapshot does not block initialization. */
      }
      if (!restored) void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      removeEventListener("popstate", restoreView);
    };
    // Bootstrap only once per mount. Re-running when the action closure changes
    // would overwrite live edits with the saved session; setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (draft) {
      try {
        writePreference(STORAGE, {
          draft,
          result,
          resultKey,
          proposal,
          policy: { risk, horizon, terminal, weights, lookahead },
        });
      } catch {
        /* Storage can be unavailable; in-memory workspace remains usable. */
      }
    }
  }, [draft, result, resultKey, proposal, risk, horizon, terminal, weights, lookahead]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
}
