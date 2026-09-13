"use client";
import { simulationChecks, type Check } from "@/lib/simulation-evidence";
import type { OrderSimulation } from "@/types/api";
import { Fragment, useState } from "react";
const fmt = (value: number) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: 3 }).format(value);

export function SimulationValidation({ result }: { result: OrderSimulation }) {
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState("");
  const checks = simulationChecks(result);
  const value = (c: Check) =>
    c.label === "Submitted order feasibility"
      ? `${fmt(c.observed)} physically rejected orders · schedule ${result.executed_schedule_feasible ? "feasible" : "needs attention"}`
      : c.status === "Not evaluated"
        ? "Not configured"
        : fmt(c.observed) + " / " + fmt(c.allowed) + " " + c.unit;
  return (
    <section className="ws-card">
      <h2>Physical Validation</h2>
      <p className="ws-help">
        Evidence from this saved order simulation. Fully used means a boundary was reached, not
        exceeded.
      </p>
      <div className={`result-verdict ${result.executed_schedule_feasible ? "passed" : "failed"}`}>
        <strong>
          {result.executed_schedule_feasible
            ? "Executed schedule is feasible"
            : "Executed schedule needs attention"}
        </strong>
        <span>
          Submitted portfolio:{" "}
          {result.submitted_portfolio_feasible ? "feasible" : "needs attention"}
        </span>
      </div>
      <div className="constraint-filters" aria-label="Filter validation checks">
        {["All", "Issue", "Fully used", "Headroom", "Verified", "Not evaluated"].map((item) => (
          <button
            key={item}
            aria-pressed={filter === item}
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {item} · {checks.filter((c) => item === "All" || c.status === item).length}
          </button>
        ))}
      </div>
      <div className="constraint-list">
        {checks
          .filter((c) => filter === "All" || c.status === filter)
          .map((c, index) => (
            <Fragment key={c.label}>
              <button
                className={`constraint-row ${c.status.toLowerCase().replaceAll(" ", "-")}`}
                aria-expanded={selected === c.label}
                aria-controls={selected === c.label ? `check-evidence-${index}` : undefined}
                onClick={() => setSelected(selected === c.label ? "" : c.label)}
              >
                <span className="constraint-name">
                  <strong>{c.label}</strong>
                  <small>{value(c)}</small>
                </span>
                <span className="constraint-track" aria-hidden="true">
                  <span style={{ width: c.utilization + "%" }} />
                  <i />
                </span>
                <span className="constraint-margin">
                  <strong>
                    {c.status === "Not evaluated"
                      ? "—"
                      : c.label === "Submitted order feasibility"
                        ? c.status === "Issue"
                          ? "Needs attention"
                          : "Verified"
                        : c.status === "Verified"
                          ? "Verified"
                          : fmt(c.margin) + " " + c.unit}
                  </strong>
                  <small>
                    {c.status === "Verified" || c.label === "Submitted order feasibility"
                      ? "integrity check"
                      : "remaining margin"}
                  </small>
                </span>
                <span className={`validation-state ${c.status.toLowerCase().replaceAll(" ", "-")}`}>
                  {c.status}
                </span>
              </button>
              {selected === c.label && (
                <aside id={`check-evidence-${index}`} className="constraint-evidence" role="status">
                  <strong>{c.label}</strong>
                  <p>{c.evidence}</p>
                  <p>Observed / allowed: {value(c)}</p>
                </aside>
              )}
            </Fragment>
          ))}
      </div>
      {!checks.some((c) => filter === "All" || c.status === filter) && (
        <p>No checks match this filter.</p>
      )}
      {result.validation.findings.length > 0 && (
        <div className="validation-findings">
          <h3>Backend findings</h3>
          {result.validation.findings.map((f, i) => (
            <p key={i}>
              {f.interval != null ? "Interval " + (f.interval + 1) + " · " : ""}
              {f.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
