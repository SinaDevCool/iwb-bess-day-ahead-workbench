import Link from "next/link";
import {
  ArrowRight,
  Check,
  History,
} from "lucide-react";
import "./present.css";

const workflow = [
  [
    "01",
    "Configure",
    "Configure market & battery",
    "Capacity, power, efficiency, availability and cycle budget.",
  ],
  [
    "02",
    "Optimize",
    "Optimize dispatch",
    "Maximize expected contribution after losses, degradation and transaction fees.",
  ],
  [
    "03",
    "Generate",
    "Generate Day-Ahead orders",
    "Convert the dispatch into clear BUY and SELL instructions.",
  ],
  [
    "04",
    "Validate",
    "Validate feasibility",
    "Check SoC, power, throughput, outages and terminal energy.",
  ],
  [
    "05",
    "Compare",
    "Compare scenarios",
    "Measure how changed prices and availability affect the recommendation.",
  ],
] as const;

export default function ProductOverview() {
  return (
    <main className="overview">
      <div className="overview-shell">
        <header className="overview-nav">
          <Link
            className="overview-brand"
            href="/"
            aria-label="IWB BESS workbench"
          >
            <span className="overview-logo" translate="no">
              IWB
            </span>
            <span>
              <strong>BESS Workbench</strong>
              <small>Day-Ahead decision support</small>
            </span>
          </Link>
          <Link className="overview-audit" href="/audit/">
            <History size={16} aria-hidden="true" />
            Decision Log
          </Link>
        </header>
        <section className="overview-hero">
          <div className="hero-copy">
            <span className="overview-eyebrow">
              BATTERY TRADING · DAY-AHEAD
            </span>
            <h1>Turn Tomorrow’s Prices Into Feasible Battery Orders</h1>
            <p>
              Optimize a 100&nbsp;MWh battery against the Day-Ahead forecast,
              validate every physical constraint, and create a trader-ready
              order proposal.
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
              <div><dt>Optimize</dt><dd>Net contribution</dd></div>
              <div><dt>Validate</dt><dd>Physical feasibility</dd></div>
              <div><dt>Control</dt><dd>Trader approval</dd></div>
            </dl>
            <small>All assumptions remain configurable in the workbench.</small>
          </aside>
        </section>
        <section className="workflow-section">
          <div className="workflow-heading">
            <span>HOW IT WORKS</span>
            <h2>One continuous decision path</h2>
            <p>From market assumptions to an explainable order proposal.</p>
          </div>
          <div className="workflow-grid">
            {workflow.map(([number, label, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <div><small>{label}</small><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </section>
        <footer className="overview-footer">
          <span>Illustrative market data</span>
          <span>
            Swiss auction parameters require configuration confirmation.
          </span>
        </footer>
      </div>
    </main>
  );
}
