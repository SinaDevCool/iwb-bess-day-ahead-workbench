import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { simulationPresentation } from "@/lib/simulation-presentation";
import type { OrderSimulation } from "@/types/api";

/** One verdict for schedule and validation, including historical/stale views. */
export function SimulationVerdict({
  result,
  stale = false,
  compact = false,
}: {
  result: OrderSimulation;
  stale?: boolean;
  compact?: boolean;
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
              ? `${result.summary.infeasible_order_count} orders excluded from the displayed schedule. ${result.executed_schedule_feasible ? "Review Physical Validation." : "The remaining schedule also needs correction. Review Physical Validation."}`
              : view.detail}
          </small>
        </span>
      </div>
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
