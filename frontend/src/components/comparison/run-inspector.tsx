"use client";
import { api } from "@/lib/api";
import {
  configurationDiff,
  configurationItems,
  formatForecastLabel,
  runDisplayName,
} from "@/lib/comparison";
import type { Simulation } from "@/types/api";
import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { formatRunTime, money, shortId } from "./comparison-format";
export function RunInspector({
  run,
  runKey,
  reference,
  setReference,
  showUnchanged,
  setShowUnchanged,
  onRenamed,
}: {
  run: Simulation;
  runKey: string;
  reference: Simulation;
  setReference: () => void;
  showUnchanged: boolean;
  setShowUnchanged: (value: boolean) => void;
  onRenamed: (run: Simulation) => void;
}) {
  const differences = configurationDiff(reference, run);
  const groups = ["Market", "Strategy", "Battery", "Availability"] as const;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(runDisplayName(run));
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const saveName = async () => {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized) {
      setRenameError("Enter a visible run name.");
      return;
    }
    setSaving(true);
    setRenameError("");
    try {
      const updated = await api<Simulation>(`/api/simulations/${run.simulation_id}/display-name`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: normalized }),
      });
      onRenamed(updated);
      setEditing(false);
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : "The run name could not be saved");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="run-inspector" aria-labelledby="selected-run-title">
      <div className="inspector-heading">
        <div className="inspector-identity">
          <span className="eyebrow">SELECTED RUN · {runKey}</span>
          {editing ? (
            <div className="rename-form">
              <label htmlFor="run-display-name">Run name</label>
              <div>
                <input
                  id="run-display-name"
                  name="run-display-name"
                  autoComplete="off"
                  maxLength={48}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveName();
                    if (event.key === "Escape") setEditing(false);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="secondary small"
                  disabled={saving}
                  onClick={saveName}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditing(false);
                    setName(runDisplayName(run));
                  }}
                >
                  Cancel
                </button>
              </div>
              {renameError && <small role="alert">{renameError}</small>}
            </div>
          ) : (
            <h3 id="selected-run-title">
              {runDisplayName(run)}{" "}
              <button
                type="button"
                className="rename-button"
                aria-label={`Rename ${runDisplayName(run)}`}
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            </h3>
          )}
          <p>
            {formatForecastLabel(run.scenario_name)} · {run.market.product_minutes} min ·{" "}
            {formatRunTime(run.created_at_utc)} ·{" "}
            <span translate="no">{shortId(run.simulation_id)}</span>
          </p>
          <p>
            {money(run.summary.expected_contribution_eur)} · {run.orders.length} orders ·{" "}
            {run.audit.modified_by_trader ? "Trader revised" : "Optimizer proposal"}
          </p>
        </div>
        {run.simulation_id !== reference.simulation_id && (
          <button type="button" className="secondary small" onClick={setReference}>
            Use as Reference
          </button>
        )}
      </div>
      {run.simulation_id === reference.simulation_id ? (
        <p className="reference-note">
          <Check size={15} aria-hidden="true" /> This run is the comparison reference.
        </p>
      ) : (
        <div className="configuration-diff">
          <div className="diff-heading">
            <strong>Changed From Reference</strong>
            <span>
              {differences.length} changed {differences.length === 1 ? "input" : "inputs"}
            </span>
          </div>
          {differences.length ? (
            <dl>
              {differences.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>
                    <span>{item.before}</span>
                    <b aria-hidden="true">→</b>
                    <strong>{item.value}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>No configuration differences. These runs share the same recorded inputs.</p>
          )}
        </div>
      )}
      <button
        type="button"
        className="text-button configuration-toggle"
        aria-expanded={showUnchanged}
        onClick={() => setShowUnchanged(!showUnchanged)}
      >
        {showUnchanged
          ? "Hide Full Configuration"
          : `Show Full Configuration · ${configurationItems(run).length} Values`}
      </button>
      {showUnchanged && (
        <div className="configuration-groups">
          {groups.map((group) => (
            <details key={group}>
              <summary>{group}</summary>
              <dl>
                {configurationItems(run)
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <div key={item.key}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
