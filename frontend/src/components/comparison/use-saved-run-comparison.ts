"use client";
import { api } from "@/lib/api";
import { runDisplayName } from "@/lib/comparison";
import type { ComparisonMetric, Simulation, SimulationRunSummary } from "@/types/api";
import { useEffect, useRef, useState } from "react";
import { MAX_RUNS } from "./comparison-format";
/** Load immutable records; changing selection never edits a saved simulation. */
export function useSavedRunComparison() {
  const [catalogue, setCatalogue] = useState<SimulationRunSummary[]>([]);
  const [runs, setRuns] = useState<Simulation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [referenceId, setReferenceId] = useState("");
  const [focusedId, setFocusedId] = useState("");
  const [metric, setMetric] = useState<ComparisonMetric>("contribution");
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("ALL");
  const [validation, setValidation] = useState("ALL");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Serialize selection requests so rapid clicks cannot append duplicates or
  // bypass MAX_RUNS while an earlier detail request is still pending.
  const selectionPending = useRef(false);

  useEffect(() => {
    let active = true;
    api<{ items: SimulationRunSummary[] }>("/api/simulation-runs?limit=100")
      .then(async ({ items }) => {
        if (!active) return;
        setCatalogue(items);
        const params = new URLSearchParams(location.search);
        const requested = (params.get("runs") ?? "")
          .split(",")
          .filter((id) => items.some((item) => item.simulation_id === id))
          .slice(0, MAX_RUNS);
        const defaults = requested.length
          ? requested
          : items.slice(0, Math.min(2, items.length)).map((item) => item.simulation_id);
        const reference = defaults.includes(params.get("reference") ?? "")
          ? params.get("reference")!
          : (defaults[0] ?? "");
        const requestedMetric = params.get("metric") as ComparisonMetric | null;
        const nextMetric = ["contribution", "throughput", "cycles", "orders"].includes(
          requestedMetric ?? "",
        )
          ? requestedMetric!
          : "contribution";
        const details = await Promise.all(
          defaults.map((id) => api<Simulation>(`/api/simulations/${id}`)),
        );
        if (!active) return;
        setSelectedIds(defaults);
        setReferenceId(reference);
        const requestedFocus = params.get("focus") ?? "";
        setFocusedId(
          defaults.includes(requestedFocus)
            ? requestedFocus
            : (defaults.find((id) => id !== reference) ?? defaults[0] ?? ""),
        );
        setMetric(nextMetric);
        setRuns(details);
      })
      .catch(
        (cause) =>
          active &&
          setError(cause instanceof Error ? cause.message : "Saved runs could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const url = new URL(location.href);
    if (selectedIds.length) url.searchParams.set("runs", selectedIds.join(","));
    else url.searchParams.delete("runs");
    if (referenceId) url.searchParams.set("reference", referenceId);
    else url.searchParams.delete("reference");
    if (focusedId) url.searchParams.set("focus", focusedId);
    else url.searchParams.delete("focus");
    url.searchParams.set("metric", metric);
    history.replaceState({}, "", url);
  }, [selectedIds, referenceId, focusedId, metric, loading]);

  const addOrRemove = async (id: string) => {
    if (selectionPending.current) return;
    if (selectedIds.includes(id)) {
      const nextIds = selectedIds.filter((item) => item !== id);
      setSelectedIds(nextIds);
      setRuns((items) => items.filter((item) => item.simulation_id !== id));
      if (referenceId === id) setReferenceId(nextIds[0] ?? "");
      if (focusedId === id)
        setFocusedId(nextIds.find((item) => item !== referenceId) ?? nextIds[0] ?? "");
      return;
    }
    if (selectedIds.length >= MAX_RUNS) return;
    selectionPending.current = true;
    try {
      const detail = await api<Simulation>(`/api/simulations/${id}`);
      setSelectedIds((items) => [...items, id]);
      setRuns((items) => [...items, detail]);
      if (!referenceId) setReferenceId(id);
      setFocusedId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected run could not be loaded");
    } finally {
      selectionPending.current = false;
    }
  };

  const onRunRenamed = (updated: Simulation) => {
    setRuns((items) =>
      items.map((item) => (item.simulation_id === updated.simulation_id ? updated : item)),
    );
    setCatalogue((items) =>
      items.map((item) =>
        item.simulation_id === updated.simulation_id
          ? { ...item, display_name: runDisplayName(updated) }
          : item,
      ),
    );
  };
  return {
    onRunRenamed,
    catalogue,
    setCatalogue,
    runs,
    setRuns,
    selectedIds,
    setSelectedIds,
    referenceId,
    setReferenceId,
    focusedId,
    setFocusedId,
    metric,
    setMetric,
    query,
    setQuery,
    product,
    setProduct,
    validation,
    setValidation,
    showUnchanged,
    setShowUnchanged,
    loading,
    setLoading,
    error,
    setError,
    addOrRemove,
  };
}
