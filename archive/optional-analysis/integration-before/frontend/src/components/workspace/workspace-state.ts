"use client";

import type { OrderSimulation } from "@/types/api";
import { useEffect, useRef, useState } from "react";

import type { Draft, Preview, View } from "./workspace-types";
/** Single in-memory owner. Child views never create a second shared draft. */
export function useWorkspaceState() {
  const [draft, setDraft] = useState<Draft>();
  const [result, setResult] = useState<OrderSimulation>();
  const [resultKey, setResultKey] = useState("");
  const [view, setView] = useState<View>("orders");
  const [scheduleSelection, setScheduleSelection] = useState<{
    simulationId: string;
    timestamp: string;
    orderId?: string;
  }>();
  const [reviewSettings, setReviewSettings] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
    "forecast" | "load-forecast" | "battery" | "costs" | "proposal" | "history" | null
  >(null);
  const [preview, setPreview] = useState<Preview>();
  const [previewKey, setPreviewKey] = useState("");
  const [undo, setUndo] = useState<Draft>();
  const [risk, setRisk] = useState("expected_value");
  const [horizon, setHorizon] = useState("minimum_reserve");
  const [terminal, setTerminal] = useState("55");
  const [weights, setWeights] = useState(["20", "60", "20"]);
  const [lookahead, setLookahead] = useState("4");
  const [confirmation, setConfirmation] = useState<{
    message: string;
    action: () => void;
  }>();
  const draftRef = useRef(draft);
  const requestId = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const [configurationOpen, setConfigurationOpen] = useState(true);
  const [comparisonKind, setComparisonKind] = useState<"simulations" | "proposals">("simulations");
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  return {
    draft,
    setDraft,
    scheduleSelection,
    setScheduleSelection,
    reviewSettings,
    setReviewSettings,
    result,
    setResult,
    resultKey,
    setResultKey,
    view,
    setView,
    selected,
    setSelected,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    modal,
    setModal,
    preview,
    setPreview,
    previewKey,
    setPreviewKey,
    undo,
    setUndo,
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
    confirmation,
    setConfirmation,
    draftRef,
    requestId,
    errorRef,
    configurationOpen,
    setConfigurationOpen,
    comparisonKind,
    setComparisonKind,
  };
}
export type WorkspaceState = ReturnType<typeof useWorkspaceState>;
