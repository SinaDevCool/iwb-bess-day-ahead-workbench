"use client";
import { EconomicsPanel } from "@/components/analytics-charts";
import { DispatchChart } from "@/components/dispatch-chart";
import { IntervalResultsTable } from "@/components/interval-results-table";
import type { OrderSimulation } from "@/types/api";
import { SimulationVerdict, SimulationAssumptions } from "./simulation-verdict";
import { simulationPresentation } from "@/lib/simulation-presentation";
import { useEffect, useMemo, useState } from "react";

export function SimulationResults({
  result,
  stale = false,
  selection,
  onSelection,
  onEditOrder,
  onRestore,
}: {
  result: OrderSimulation;
  stale?: boolean;
  selection?: { simulationId: string; timestamp: string; orderId?: string };
  onSelection?: (timestamp: string) => void;
  onEditOrder?: (id: string) => void;
  onRestore?: () => void;
}) {
  const ordered = useMemo(
    () =>
      [...result.order_results].sort((a, b) =>
        a.submitted_order.delivery_start_utc.localeCompare(b.submitted_order.delivery_start_utc),
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
  const [selectedId, setSelectedId] = useState<string>();
  const selectedInterval =
    selection?.simulationId === result.simulation_id ? selection.timestamp : undefined;
  const setSelectedInterval = (value: string) => onSelection?.(value);
  const marketPassed = result.order_results.filter(
    (o) => o.submitted_order.order_type === "MARKET" || o.price_condition_passed === true,
  ).length;
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
      <SimulationVerdict result={result} stale={stale} />
      <details className="ws-validation-line">
        <summary>
          Execution checks & assumptions ·{" "}
          {result.submitted_portfolio_feasible
            ? "submitted portfolio feasible"
            : "submitted portfolio needs attention"}
        </summary>
        <p>
          Submitted portfolio:{" "}
          {result.submitted_portfolio_feasible ? "feasible" : "needs attention"} · {marketPassed}{" "}
          price-eligible · {result.summary.not_executed_order_count} price-rejected ·{" "}
          {result.summary.infeasible_order_count} would violate battery constraints.
        </p>
        <SimulationAssumptions result={result} />
      </details>
      {!detailView && (
        <>
          <div className="simulator-card">
            <DispatchChart
              rows={result.dispatch}
              battery={result.battery}
              forecast={result.forecast}
              mode="order-simulation"
              executedOrderCount={result.summary.executed_order_count}
              submittedOrderCount={result.summary.submitted_order_count}
              orderResults={ordered}
              selectedOrderId={
                selectedId ??
                (selection?.simulationId === result.simulation_id ? selection.orderId : undefined)
              }
              onSelectOrder={setSelectedId}
              selectedInterval={selectedInterval}
              onSelectInterval={setSelectedInterval}
              showContribution
              contributionLabel={simulationPresentation(result).contributionLabel}
            />
          </div>
          <EconomicsPanel result={result} breakdownOnly />
        </>
      )}
      {detailView && (
        <IntervalResultsTable
          result={result}
          onEditOrder={stale ? undefined : onEditOrder}
          selectedId={selectedInterval}
          onSelect={setSelectedInterval}
        />
      )}
    </div>
  );
}
