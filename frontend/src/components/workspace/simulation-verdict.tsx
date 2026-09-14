import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { simulationPresentation } from "@/lib/simulation-presentation";
import type { OrderSimulation } from "@/types/api";

/** One verdict for schedule and validation, including historical/stale views. */
export function SimulationVerdict({
  result,
  stale = false,
  compact = false,
  action,
}: {
  result: OrderSimulation;
  stale?: boolean;
  compact?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  const view = simulationPresentation(result, stale);
  const Icon =
    view.severity === "failed" ? AlertTriangle : view.severity === "passed" ? CheckCircle2 : Info;
  return (
    <div className={`result-verdict ${view.severity}`} role="status">
      <div>
        <Icon aria-hidden="true" />
        <span>
          <strong>{view.title}</strong>
          <small>
            {compact && !stale && result.summary.infeasible_order_count > 0
              ? `${result.summary.infeasible_order_count} ${result.summary.infeasible_order_count === 1 ? "order" : "orders"} excluded from the displayed schedule. ${result.executed_schedule_feasible ? "Review the order outcomes." : "The remaining schedule also needs correction. Review the order outcomes."}`
              : view.detail}
          </small>
        </span>
      </div>
      {action && (
        <button className="secondary verdict-action" onClick={action.onClick}>
          {action.label} →
        </button>
      )}
    </div>
  );
}

export function SimulationAssumptions({ result }: { result?: OrderSimulation }) {
  return (
    <details className="ws-validation-line">
      <summary>Simulation assumptions</summary>
      {!result || result.assumptions ? (
        <p>
          The entered forecast is the simulated clearing and settlement price. Price-eligible,
          physically feasible orders are fully allocated, including orders exactly at their limit.
          Actual auction allocation is not modelled. Physically infeasible batches are excluded
          without clipping or netting.
        </p>
      ) : (
        <p>
          Historical result: detailed versioned assumptions were not recorded.{" "}
          {typeof result.audit?.clearing_assumption === "string"
            ? result.audit.clearing_assumption
            : "Consult the saved result evidence; current simulation rules have not been applied retroactively."}
        </p>
      )}
      {result && <small>Engine: {String(result.audit?.simulation_engine ?? "Not recorded")}</small>}
    </details>
  );
}
