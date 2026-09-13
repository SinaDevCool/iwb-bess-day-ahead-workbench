"use client";
import { SavedRunComparison } from "@/components/comparison/saved-run-comparison";
import { SimulationComparison } from "./simulation-comparison";
import type { ReadyWorkbench } from "./use-workbench";

/** Comparison owns saved-record focus. It never substitutes working-case inputs. */
export function ComparisonView({
  context,
}: {
  context: Pick<ReadyWorkbench, "view" | "comparisonKind" | "selectComparison">;
}) {
  const { view, comparisonKind, selectComparison } = context;
  if (view !== "compare") return null;
  return (
    <>
      <p className="ws-help">
        Inspecting saved snapshots. The configuration panel edits your working case, not these saved
        runs.
      </p>
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
      {comparisonKind === "simulations" ? <SimulationComparison /> : <SavedRunComparison />}
    </>
  );
}
