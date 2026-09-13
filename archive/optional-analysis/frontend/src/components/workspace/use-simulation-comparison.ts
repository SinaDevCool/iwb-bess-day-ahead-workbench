"use client";
import { api } from "@/lib/api";
import type { OrderSimulation } from "@/types/api";
import { useEffect, useState } from "react";
/** Each simulation retains its own forecast; no repricing occurs here. */
export function useSimulationComparison() {
  const [runs, setRuns] = useState<OrderSimulation[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [inspected, setInspected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ items: OrderSimulation[] }>("/api/order-simulations")
      .then(({ items }) => {
        if (!active) return;
        setRuns(items);
        setIds(items.slice(0, 2).map((r) => r.simulation_id));
        setInspected(items[0]?.simulation_id ?? "");
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const selected = ids
    .map((id) => runs.find((r) => r.simulation_id === id))
    .filter((r): r is OrderSimulation => Boolean(r));
  const reference = selected[0];
  const detail = selected.find((r) => r.simulation_id === inspected) ?? reference;
  const extent = Math.max(1, ...selected.map((r) => Math.abs(r.summary.net_contribution_eur)));
  return {
    runs,
    ids,
    setIds,
    inspected,
    setInspected,
    error,
    setError,
    loading,
    setLoading,
    setAttempt,
    selected,
    reference,
    detail,
    extent,
  };
}
