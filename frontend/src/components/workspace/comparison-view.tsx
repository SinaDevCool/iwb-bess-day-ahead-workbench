"use client";

import { SavedRunComparison } from "@/components/comparison/saved-run-comparison";
import { SensitivityPanel } from "@/components/sensitivity-panel";
import { SimulationComparison } from "./simulation-comparison";

import type { ReadyWorkbench } from "./use-workbench";
import { euro, num } from "./workspace-format";
/** Presentation only: all shared state remains in the workbench controller. */
export function ComparisonView({
  context,
}: {
  context: Pick<
    ReadyWorkbench,
    | "view"
    | "busy"
    | "setModal"
    | "proposal"
    | "comparisonKind"
    | "selectComparison"
    | "sensitivity"
  >;
}) {
  const { view, busy, setModal, proposal, comparisonKind, selectComparison, sensitivity } = context;
  return (
    view === "compare" && (
      <>
        <div className="uw-comparison-switch">
          <button
            className="secondary"
            aria-pressed={comparisonKind === "simulations"}
            onClick={() => selectComparison("simulations")}
          >
            Order simulations
          </button>
          <button
            className="secondary"
            aria-pressed={comparisonKind === "proposals"}
            onClick={() => selectComparison("proposals")}
          >
            Optimizer proposals
          </button>
        </div>
        {comparisonKind === "simulations" ? (
          <SimulationComparison />
        ) : (
          <>
            <section className="ws-card">
              <h2>Proposal analysis</h2>
              <p className="ws-help">
                Optimization proposals and simulated execution are distinct. Cash contribution
                excludes continuation value. Compare only like-for-like forecasts and asset
                assumptions.
              </p>
              {proposal ? (
                <>
                  <div className="ws-metrics">
                    <div>
                      Proposal contribution
                      <strong>{euro(proposal.summary.expected_contribution_eur)}</strong>
                    </div>
                    <div>
                      Continuation value
                      <strong>{euro(proposal.summary.terminal_energy_value_eur)}</strong>
                    </div>
                    <div>
                      Final stored energy
                      <strong>{num(proposal.summary.proposal_terminal_soc_mwh)} MWh</strong>
                    </div>
                  </div>
                  <p className="ws-help">
                    Proposal reference · <code>{proposal.simulation_id}</code>
                  </p>
                  <details>
                    <summary>Optimization evidence</summary>
                    <p>
                      Best evaluated candidate under the selected risk preference; not a global
                      robust-optimum guarantee. Next-day policies use an illustrative
                      continuation-value proxy. Break-even estimates are pricing references, not
                      guaranteed margins.
                    </p>
                    <pre>{JSON.stringify(proposal.optimization, null, 2)}</pre>
                  </details>
                  {proposal.sensitivities?.length ? (
                    <SensitivityPanel items={proposal.sensitivities} />
                  ) : (
                    <button
                      className="secondary"
                      disabled={Boolean(busy)}
                      onClick={() => void sensitivity()}
                    >
                      Calculate sensitivities
                    </button>
                  )}
                </>
              ) : (
                <div className="ws-empty">
                  <p>Generate a proposal or open one from History to inspect its evidence.</p>
                  <button className="secondary" onClick={() => setModal("proposal")}>
                    Generate proposal
                  </button>
                  <button className="ws-text-button" onClick={() => setModal("history")}>
                    Open history
                  </button>
                </div>
              )}
            </section>
            <SavedRunComparison />
          </>
        )}
      </>
    )
  );
}
