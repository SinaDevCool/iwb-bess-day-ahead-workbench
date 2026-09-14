"use client";

import { DispatchChart } from "@/components/dispatch-chart";
import { IntervalResultsTable } from "@/components/interval-results-table";
import type { OrderSimulation } from "@/types/api";
import { SimulationVerdict } from "./simulation-verdict";
import { simulationPresentation } from "@/lib/simulation-presentation";
import { isPhysicallyRejected } from "./order-presentation";
import { useEffect, useMemo, useState } from "react";

export function SimulationResults({
  result,
  stale = false,
  selection,
  onSelection,
  onEditOrder,
  onRestore,
  onReviewOrders,
}: {
  result: OrderSimulation;
  stale?: boolean;
  selection?: { simulationId: string; timestamp: string; orderId?: string };
  onSelection?: (timestamp: string, orderId?: string) => void;
  onEditOrder?: (id: string) => void;
  onRestore?: () => void;
  onReviewOrders?: () => void;
}) {
  const ordered = useMemo(
    () =>
      [...result.order_results].sort(
        (a, b) =>
          Date.parse(a.submitted_order.delivery_start_utc) -
          Date.parse(b.submitted_order.delivery_start_utc),
      ),
    [result],
  );
  const [detailView, updateDetailView] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(location.search).get("scheduleView") === "detail",
  );
  const setDetailView = (detail: boolean) => {
    updateDetailView(detail);
    const url = new URL(location.href);
    url.searchParams.set("scheduleView", detail ? "detail" : "overview");
    history.pushState({}, "", url);
  };
  useEffect(() => {
    const restore = () =>
      updateDetailView(new URLSearchParams(location.search).get("scheduleView") === "detail");
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const selectedInterval =
    selection?.simulationId === result.simulation_id ? selection.timestamp : undefined;
  const setSelectedInterval = (value: string) => onSelection?.(value);
  const blocked = ordered.filter(isPhysicallyRejected);
  const needsAttention =
    blocked.length > 0 ||
    !result.submitted_portfolio_feasible ||
    !result.executed_schedule_feasible;
  const action = needsAttention
    ? !stale && blocked.length && onEditOrder
      ? {
          label: blocked.length === 1 ? "Edit order" : "Edit orders",
          onClick: () => onEditOrder(blocked[0].submitted_order.client_order_id),
        }
      : onReviewOrders
        ? { label: stale ? "Review current orders" : "Review orders", onClick: onReviewOrders }
        : undefined
    : undefined;
  return (
    <div className="simulation-results">
      {stale && onRestore && (
        <button className="secondary" onClick={onRestore}>
          Restore these inputs to edit orders
        </button>
      )}
      <div className="uw-comparison-switch">
        <button
          className="secondary"
          aria-pressed={!detailView}
          onClick={() => setDetailView(false)}
        >
          Overview
        </button>
        <button className="secondary" aria-pressed={detailView} onClick={() => setDetailView(true)}>
          Interval Detail
        </button>
      </div>
      <SimulationVerdict result={result} stale={stale} compact action={action} />

      {!detailView && (
        <>
          <div className="simulator-card">
            <DispatchChart
              key={result.simulation_id}
              market={result.market}
              onShowDetails={() => setDetailView(true)}
              rows={result.dispatch}
              battery={result.battery}
              forecast={result.forecast}
              mode="order-simulation"
              orderResults={ordered}
              selectedOrderId={
                selection?.simulationId === result.simulation_id ? selection.orderId : undefined
              }
              selectedInterval={selectedInterval}
              onSelectInterval={setSelectedInterval}
              showContribution
              contributionLabel={simulationPresentation(result).contributionLabel}
            />
          </div>
        </>
      )}
      {detailView && (
        <IntervalResultsTable
          key={result.simulation_id}
          result={result}
          onEditOrder={stale ? undefined : onEditOrder}
          selectedId={selectedInterval}
          onSelect={setSelectedInterval}
        />
      )}
    </div>
  );
}
