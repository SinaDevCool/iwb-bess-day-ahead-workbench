"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { runDisplayName } from "@/lib/comparison";
import type { Simulation } from "@/types/api";
import { SensitivityPanel } from "@/components/sensitivity-panel";
import { euro, num } from "@/components/workspace/workspace-format";

/** Read-only evidence follows comparison focus, never the editable working case. */
export function ProposalAnalysis({
  run,
  update,
}: {
  run: Simulation;
  update: (run: Simulation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const calculate = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await api<{ items: NonNullable<Simulation["sensitivities"]> }>(
        `/api/simulations/${run.simulation_id}/sensitivities`,
        { method: "POST" },
      );
      // Update by immutable run ID; a late response must not change comparison focus.
      update({ ...run, sensitivities: next.items });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sensitivity calculation failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ws-card" aria-label="Focused proposal analysis">
      <h2>Proposal analysis · {runDisplayName(run)}</h2>
      <p className="ws-help">
        Saved proposal {run.simulation_id} · {run.delivery_date}. Inspecting this snapshot does not
        change working-case inputs.
      </p>
      <div className="ws-metrics">
        <div>
          Proposal contribution<strong>{euro(run.summary.expected_contribution_eur)}</strong>
        </div>
        <div>
          Continuation value<strong>{euro(run.summary.terminal_energy_value_eur)}</strong>
        </div>
        <div>
          Final stored energy<strong>{num(run.summary.proposal_terminal_soc_mwh)} MWh</strong>
        </div>
      </div>
      <details>
        <summary>Optimization evidence</summary>
        <p>
          Best evaluated candidate under the selected risk preference; not a global robust-optimum
          guarantee. Cash contribution excludes continuation value. Next-day policies use
          illustrative proxies; break-even estimates are not guaranteed margins.
        </p>
        <pre>{JSON.stringify(run.optimization, null, 2)}</pre>
      </details>
      {error && <p role="alert">{error}</p>}
      {run.sensitivities?.length ? (
        <SensitivityPanel items={run.sensitivities} />
      ) : (
        <button className="secondary" disabled={busy} onClick={() => void calculate()}>
          {busy ? "Calculating…" : "Calculate sensitivities"}
        </button>
      )}
    </section>
  );
}
