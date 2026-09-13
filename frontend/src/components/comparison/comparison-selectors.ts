import { comparisonKey, configurationSignature, runDisplayName } from "@/lib/comparison";
import type { Simulation, SimulationRunSummary } from "@/types/api";
/** Derive labels, duplicates and filters without mutating saved runs. */
export function comparisonSelection(
  runs: Simulation[],
  reference: Simulation | undefined,
  catalogue: SimulationRunSummary[],
  query: string,
  product: string,
  validation: string,
) {
  const descriptors = runs.map((run, index) => ({
    run,
    key: comparisonKey(index),
    name: runDisplayName(run),
    signature: reference ? configurationSignature(reference, run) : "",
  }));
  const grouped = new Map<string, typeof descriptors>();
  descriptors.forEach((item) =>
    grouped.set(item.run.audit.input_hash, [
      ...(grouped.get(item.run.audit.input_hash) ?? []),
      item,
    ]),
  );
  const duplicateGroups = [...grouped.values()].filter((items) => items.length > 1);
  const filtered = catalogue.filter((run) => {
    const needle = query.trim().toLowerCase();
    return (
      (!needle ||
        `${run.display_name} ${run.scenario_name} ${run.delivery_date} ${run.simulation_id}`
          .toLowerCase()
          .includes(needle)) &&
      (product === "ALL" || String(run.product_minutes) === product) &&
      (validation === "ALL" || run.validation_status === validation)
    );
  });

  return { descriptors, duplicateGroups, filtered };
}
