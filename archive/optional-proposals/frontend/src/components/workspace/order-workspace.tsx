"use client";
import { simulationPresentation } from "@/lib/simulation-presentation";

import { LoaderCircle } from "lucide-react";
import { SimulationResults } from "./simulation-results";

import { ConfigurationPanel } from "./configuration-panel";
import { OrdersView } from "./orders-view";
import { useWorkbench } from "./use-workbench";
import { WorkspaceDialogs } from "./workspace-dialogs";
import { euro, num } from "./workspace-format";
import { TimePreference, TimezoneSelector } from "./time-preference";
/** Application composition; business actions and editable state live in useWorkbench. */
export function UnifiedWorkbench() {
  return (
    <TimePreference>
      <WorkbenchContent />
    </TimePreference>
  );
}
function WorkbenchContent() {
  const context = useWorkbench();
  const {
    draft,
    setDraft,
    result,
    view,
    busy,
    error,
    notice,
    setNotice,
    setModal,
    undo,
    setUndo,
    errorRef,
    configurationOpen,
    setConfigurationOpen,
    dirty,
    navigate,
    load,
    simulate,
  } = context;
  if (!draft)
    return (
      <main className="simulator-loading" role={error ? "alert" : "status"}>
        {error ? (
          <div>
            <h1>Workbench unavailable</h1>
            <p>{error}</p>
            <button onClick={() => void load()}>Retry Loading</button>
          </div>
        ) : (
          "Loading workbench…"
        )}
      </main>
    );
  const ready = { ...context, draft };
  return (
    <div className="order-workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <header className="ws-header">
        <div className="ws-brand">
          <span className="logo">IWB</span>
          <div>
            <h1>BESS Day-Ahead Workbench</h1>
            <small>Day-Ahead orders · simulation & optimization</small>
          </div>
        </div>
        <div className="ws-actions">
          <TimezoneSelector />
          <button className="ws-text-button" onClick={() => setModal("history")}>
            History
          </button>
          <span className="uw-demo">Demo · No live submission</span>
        </div>
      </header>
      <div className="uw-layout" data-config={configurationOpen ? "open" : "closed"}>
        <ConfigurationPanel context={ready} />
        <div className="uw-content">
          <div className="uw-toolbar">
            <button
              className="secondary small"
              aria-expanded={configurationOpen}
              onClick={() => setConfigurationOpen(!configurationOpen)}
            >
              {configurationOpen ? "Hide configuration" : "Configure case"}
            </button>
            <span>
              {draft.date} · {draft.market.bidding_zone} · {draft.market.product_minutes} min
            </span>
            <button
              className="primary compact"
              disabled={Boolean(busy)}
              onClick={() => void simulate()}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={15} />
                  {busy}…
                </>
              ) : (
                "Simulate orders"
              )}
            </button>
          </div>
          {result && (
            <section aria-label="Working case result">
              <p className={dirty ? "stale-notice" : "ws-help"} role="status">
                {dirty ? "Previous simulation—inputs changed" : "Current working-case simulation"} ·{" "}
                {result.simulation_id} · {result.delivery_date}
              </p>
              <div
                className="uw-kpis"
                aria-label={dirty ? "Previous simulation metrics" : "Current simulation metrics"}
              >
                <div>
                  <span>{simulationPresentation(result).contributionLabel}</span>
                  <strong>{euro(result.summary.net_contribution_eur)}</strong>
                  <small>
                    {result.submitted_portfolio_feasible
                      ? "Sales − purchases − costs"
                      : "Portfolio needs attention · review order outcomes"}
                  </small>
                </div>
                <div>
                  <span>Executed orders</span>
                  <strong>
                    {result.summary.executed_order_count} / {result.summary.submitted_order_count}
                  </strong>
                  <small>Executed / entered</small>
                </div>
                <div>
                  <span>Battery throughput</span>
                  <strong>{num(result.summary.throughput_mwh)} MWh</strong>
                  <small>{num(result.summary.equivalent_cycles, 2)} EFC</small>
                </div>
                <div>
                  <span>Final SoC</span>
                  <strong>{num(result.summary.final_soc_mwh)} MWh</strong>
                  <small>Reserve {num(result.battery.target_soc_mwh)} MWh</small>
                </div>
              </div>
            </section>
          )}
          <nav className="uw-tabs" aria-label="Workbench views">
            {(
              [
                ["orders", "Auction Orders"],
                ["schedule", "Dispatch & Economics"],
              ] as const
            ).map(([key, label]) => (
              <a
                key={key}
                href={`?tab=${key}`}
                aria-current={view === key ? "page" : undefined}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    navigate(key);
                  }
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <main id="workspace-main">
            {error && (
              <div className="banner error" role="alert" tabIndex={-1} ref={errorRef}>
                {error}
              </div>
            )}
            {notice && (
              <div className="ws-notice" role="status">
                {notice}
              </div>
            )}
            {undo && (
              <div className="ws-notice">
                Previous inputs can be restored.{" "}
                <button
                  onClick={() => {
                    setDraft(undo);
                    setUndo(undefined);
                    context.setError("");
                    context.setSelected("");
                    setNotice("Previous inputs restored.");
                  }}
                >
                  Undo
                </button>
              </div>
            )}
            <OrdersView context={ready} />
            {view === "schedule" &&
              (result ? (
                <SimulationResults
                  result={result}
                  stale={dirty}
                  selection={context.scheduleSelection}
                  onSelection={(timestamp, orderId) =>
                    context.setScheduleSelection({
                      simulationId: result.simulation_id,
                      timestamp,
                      orderId,
                    })
                  }
                  onEditOrder={context.editResultOrder}
                  onRestore={() => void context.restore(result.simulation_id, "ORDER_SIMULATION")}
                />
              ) : (
                <section className="ws-card ws-empty">
                  <h2>Dispatch & Economics</h2>
                  <p>
                    Enter a forecast and orders, then simulate to inspect execution and stored
                    energy.
                  </p>
                  <button className="secondary" onClick={() => navigate("orders")}>
                    Go to Auction Orders
                  </button>
                </section>
              ))}
          </main>
        </div>
      </div>
      <WorkspaceDialogs context={ready} />
    </div>
  );
}
