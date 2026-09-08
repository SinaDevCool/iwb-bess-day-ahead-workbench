import Link from "next/link";
import {
  ArrowRight,
  BatteryCharging,
  ChartNoAxesCombined,
  Check,
  ClipboardCheck,
  History,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import "./present.css";

const workflow = [
  [
    "01",
    "Configure",
    "Configure market & battery",
    "Capacity, power, efficiency, availability and cycle budget.",
    BatteryCharging,
  ],
  [
    "02",
    "Optimize",
    "Optimize dispatch",
    "Maximize expected contribution after losses and degradation.",
    ChartNoAxesCombined,
  ],
  [
    "03",
    "Generate",
    "Generate Day-Ahead orders",
    "Convert the dispatch into clear BUY and SELL instructions.",
    ShoppingCart,
  ],
  [
    "04",
    "Validate",
    "Validate feasibility",
    "Check SoC, power, throughput, outages and terminal energy.",
    ClipboardCheck,
  ],
  [
    "05",
    "Compare",
    "Compare scenarios",
    "Measure how changed prices and availability affect the recommendation.",
    ShieldCheck,
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
            <h1>Day-Ahead Battery Dispatch &amp; Order Optimizer</h1>
            <p>
              Simulate the contribution-maximizing operation of a 100&nbsp;MWh
              battery and generate physically feasible Day-Ahead auction orders
              under trader control.
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
          <aside className="decision-card" aria-label="Decision model summary">
            <div className="decision-head">
              <span>ASSET IN SCOPE</span>
              <span className="model-status">
                <i />
                Ready
              </span>
            </div>
            <div className="asset-line">
              <BatteryCharging aria-hidden="true" />
              <div>
                <strong>100 MWh</strong>
                <span>50 MW · 2-hour system</span>
              </div>
            </div>
            <div className="decision-flow">
              <span>Forecast</span>
              <i />
              <span>Dispatch</span>
              <i />
              <span>Orders</span>
            </div>
            <dl>
              <div>
                <dt>Objective</dt>
                <dd>Net contribution</dd>
              </div>
              <div>
                <dt>Guardrails</dt>
                <dd>Physical + market</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>Trader controlled</dd>
              </div>
            </dl>
          </aside>
        </section>
        <section className="outcome-row" aria-label="Product outcomes">
          <div>
            <span>VALUE</span>
            <strong>Economically optimized</strong>
            <p>Sales less purchases, efficiency losses and degradation.</p>
          </div>
          <div>
            <span>CONFIDENCE</span>
            <strong>Physically feasible</strong>
            <p>Every interval validated against the battery envelope.</p>
          </div>
          <div>
            <span>CONTROL</span>
            <strong>Operationally governed</strong>
            <p>Trader changes are revalidated and recorded.</p>
          </div>
        </section>
        <section className="workflow-section">
          <div className="workflow-heading">
            <span>HOW IT WORKS</span>
            <h2>One continuous decision path</h2>
            <p>Each step produces the evidence required by the next.</p>
          </div>
          <div className="workflow-grid">
            {workflow.map(([number, label, title, description, Icon]) => (
              <article key={number}>
                <div>
                  <span>{number}</span>
                  <Icon aria-hidden="true" />
                </div>
                <small>{label}</small>
                <h3>{title}</h3>
                <p>{description}</p>
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
