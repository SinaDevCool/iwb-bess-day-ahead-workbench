"use client";
import { EconomicsPanel } from "@/components/analytics-charts";
import { DispatchChart } from "@/components/dispatch-chart";
import { IntervalResultsTable } from "@/components/interval-results-table";
import type { OrderSimulation } from "@/types/api";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";

export function SimulationResults({
  result,
  stale = false,
}: {
  result: OrderSimulation;
  stale?: boolean;
}) {
  const ordered = useMemo(
    () =>
      [...result.order_results].sort((a, b) =>
        a.submitted_order.delivery_start_utc.localeCompare(b.submitted_order.delivery_start_utc),
      ),
    [result],
  );
  const [detailView, setDetailView] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedInterval, setSelectedInterval] = useState<string>();
  const marketPassed = result.order_results.filter(
    (o) => o.submitted_order.order_type === "MARKET" || o.price_condition_passed === true,
  ).length;
  const summary = !result.summary.submitted_order_count
    ? "No orders entered. The simulation shows the idle battery schedule."
    : result.summary.infeasible_order_count
      ? `${result.summary.executed_order_count} of ${result.summary.submitted_order_count} orders executed; ${result.summary.infeasible_order_count} physically infeasible.`
      : result.summary.not_executed_order_count
        ? `${result.summary.executed_order_count} of ${result.summary.submitted_order_count} orders executed; ${result.summary.not_executed_order_count} did not meet the price condition.`
        : `All ${result.summary.executed_order_count} submitted orders executed.`;
  return (
    <div className="simulation-results">
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
      <div className={`result-verdict ${result.executed_schedule_feasible ? "passed" : "failed"}`}>
        <div>
          {result.executed_schedule_feasible ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <AlertTriangle aria-hidden="true" />
          )}
          <span>
            <strong>
              {stale ? "Previous simulation — inputs changed. " : ""}
              {summary}
            </strong>
            <small>
              The resulting battery schedule is{" "}
              {result.executed_schedule_feasible
                ? "physically feasible"
                : "not physically feasible"}
              .
            </small>
          </span>
        </div>
      </div>
      <details className="ws-validation-line">
        <summary>
          Execution checks ·{" "}
          {result.submitted_portfolio_feasible
            ? "submitted portfolio feasible"
            : "submitted portfolio needs attention"}
        </summary>
        <p>
          Submitted portfolio:{" "}
          {result.submitted_portfolio_feasible ? "feasible" : "needs attention"} · {marketPassed}{" "}
          price-eligible · {result.summary.not_executed_order_count} price-rejected ·{" "}
          {result.summary.infeasible_order_count} physically rejected.
        </p>
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
              selectedOrderId={selectedId}
              onSelectOrder={setSelectedId}
              selectedInterval={selectedInterval}
              onSelectInterval={setSelectedInterval}
              showContribution
            />
          </div>
          <EconomicsPanel result={result} breakdownOnly />
        </>
      )}
      {detailView && (
        <IntervalResultsTable
          result={result}
          selectedId={selectedInterval}
          onSelect={setSelectedInterval}
        />
      )}
    </div>
  );
}
