import type { OrderSimulation } from "@/types/api";

/** Presentation only: backend outcomes remain the source of physical truth. */
export function simulationPresentation(result: OrderSimulation, stale = false) {
  const s = result.summary;
  const excluded = s.infeasible_order_count > 0;
  const contributionLabel = excluded
    ? "Contribution of remaining schedule"
    : "Simulated net contribution";
  const scope = excluded
    ? `${s.infeasible_order_count} physically infeasible ${s.infeasible_order_count === 1 ? "order is" : "orders are"} excluded from the displayed schedule and contribution. ${result.executed_schedule_feasible ? "The remaining schedule is feasible, not the complete entered portfolio." : "The remaining schedule also needs physical correction."}`
    : !result.executed_schedule_feasible
      ? "Amounts describe a schedule that needs physical correction; they are not a feasible portfolio result."
      : "Contribution includes simulated executions only, at the entered forecast prices.";
  const portfolioLabel = result.submitted_portfolio_feasible
    ? "Portfolio feasible"
    : "Portfolio needs attention";
  if (stale)
    return {
      severity: "neutral",
      title: "Previous result — inputs changed",
      detail: "Simulate again to evaluate the current inputs. " + scope,
      contributionLabel,
      scope,
      portfolioLabel,
    };
  if (excluded)
    return {
      severity: "failed",
      title: "Entered portfolio is not physically feasible",
      detail: scope,
      contributionLabel,
      scope,
      portfolioLabel,
    };
  if (!result.executed_schedule_feasible || !result.submitted_portfolio_feasible)
    return {
      severity: "failed",
      title: "Simulated schedule needs attention",
      detail: scope,
      contributionLabel,
      scope,
      portfolioLabel,
    };
  if (!s.submitted_order_count)
    return {
      severity: "neutral",
      title: "No orders entered — idle schedule",
      detail: "Enter orders to simulate their price conditions and battery impact.",
      contributionLabel,
      scope,
      portfolioLabel,
    };
  if (s.not_executed_order_count)
    return {
      severity: "neutral",
      title: "Simulation complete — some price conditions were not met",
      detail: `${s.executed_order_count} orders executed; ${s.not_executed_order_count} did not meet their price condition. The resulting schedule is physically feasible.`,
      contributionLabel,
      scope,
      portfolioLabel,
    };
  return {
    severity: "passed",
    title:
      s.executed_order_count === 1
        ? "The entered order executed in this simulation"
        : `All ${s.executed_order_count} entered orders executed in this simulation`,
    detail:
      "The resulting battery schedule is physically feasible. Actual auction allocation is not modelled.",
    contributionLabel,
    scope,
    portfolioLabel,
  };
}
