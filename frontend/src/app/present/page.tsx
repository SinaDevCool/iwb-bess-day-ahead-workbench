import { ArrowRight, Check, History } from "lucide-react";
import Link from "next/link";
import "./present.css";

const workflow = [
  [
    "01",
    "Configure",
    "Configure market & battery",
    "Load or edit the Day-Ahead price forecast and configure battery limits.",
  ],
  [
    "02",
    "Enter orders",
    "Enter Market & Limit orders",
    "Choose BUY or SELL, delivery interval, volume and an optional price limit.",
  ],
  [
    "03",
    "Optimize optionally",
    "Generate a proposal",
    "Optionally optimize net contribution, review the proposal and apply its orders.",
  ],
  [
    "04",
    "Simulate",
    "Inspect the battery schedule",
    "Simulate entered orders against forecast prices and inspect power, SoC and validation.",
  ],
  [
    "05",
    "Compare",
    "Compare saved results",
    "Inspect saved inputs and compare simulation results or optimization proposals.",
  ],
] as const;

export default function ProductOverview() {
  return (
    <main className="overview">
      <div className="overview-shell">
        <header className="overview-nav">
          <Link className="overview-brand" href="/" aria-label="IWB BESS workbench">
            <span className="overview-logo" translate="no">
              IWB
            </span>
            <span>
              <strong>BESS Workbench</strong>
              <small>Day-Ahead decision support</small>
            </span>
          </Link>
          <Link className="overview-audit" href="/?workspace=history">
            <History size={16} aria-hidden="true" />
            History
          </Link>
        </header>
        <section className="overview-hero">
          <div className="hero-copy">
            <span className="overview-eyebrow">BATTERY TRADING · DAY-AHEAD</span>
            <h1>Turn Tomorrow’s Prices Into Feasible Battery Orders</h1>
            <p>
              Enter Market and Limit orders for a 100&nbsp;MWh battery, simulate them against a
              Day-Ahead price forecast, and inspect the resulting schedule and configured
              constraints.
            </p>
            <div className="hero-actions">
              <Link className="overview-primary" href="/">
                Launch Workbench <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <span>
                <Check size={15} aria-hidden="true" />
                No live order submission
              </span>
            </div>
          </div>
          <aside className="decision-card" aria-labelledby="baseline-title">
            <span className="overview-eyebrow">MODEL BASELINE</span>
            <h2 id="baseline-title">100 MWh · 50 MW</h2>
            <p>2-hour battery system</p>
            <dl>
              <div>
                <dt>Optimize</dt>
                <dd>Net contribution</dd>
              </div>
              <div>
                <dt>Validate</dt>
                <dd>Physical feasibility</dd>
              </div>
              <div>
                <dt>Control</dt>
                <dd>Editable orders</dd>
              </div>
            </dl>
            <small>All assumptions remain configurable in the workbench.</small>
          </aside>
        </section>
        <section className="workflow-section">
          <div className="workflow-heading">
            <span>HOW IT WORKS</span>
            <h2>One continuous decision path</h2>
            <p>
              One shared forecast and battery configuration, from entered orders to saved results.
            </p>
          </div>
          <div className="workflow-grid">
            {workflow.map(([number, label, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <div>
                  <small>{label}</small>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <footer className="overview-footer">
          <span>Demo or user-supplied forecast data</span>
          <span>Swiss auction parameters require configuration confirmation.</span>
        </footer>
      </div>
    </main>
  );
}
