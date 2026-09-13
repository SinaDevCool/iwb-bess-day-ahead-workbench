"use client";
import { simulationPresentation } from "@/lib/simulation-presentation";
import { SimulationAssumptions } from "./simulation-verdict";
import type { OrderSimulation } from "@/types/api";
import { useSimulationComparison } from "./use-simulation-comparison";
const money = (n: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
const name = (r: OrderSimulation) => "Run " + r.simulation_id.slice(-6);

export function SimulationComparison() {
  const {
    runs,
    ids,
    setIds,
    setInspected,
    error,
    setError,
    loading,
    setLoading,
    setAttempt,
    selected,
    reference,
    detail,
    extent,
  } = useSimulationComparison();
  return (
    <section className="ws-card">
      <div className="ws-section-head">
        <h2>Compare saved simulations</h2>
        <details className="uw-run-picker">
          <summary>Select runs · {ids.length}/4</summary>
          <div>
            {runs.map((r) => (
              <label key={r.simulation_id}>
                <input
                  type="checkbox"
                  checked={ids.includes(r.simulation_id)}
                  disabled={!ids.includes(r.simulation_id) && ids.length >= 4}
                  onChange={() =>
                    setIds((current) =>
                      current.includes(r.simulation_id)
                        ? current.filter((id) => id !== r.simulation_id)
                        : [...current, r.simulation_id],
                    )
                  }
                />
                {name(r)} · {r.delivery_date} · {r.market.product_minutes} min
              </label>
            ))}
          </div>
        </details>
      </div>
      <p className="ws-help">
        Each result uses its own saved forecast and orders. Differences are not necessarily caused
        by a single parameter. Select a run to inspect its inputs; the first selected run is the
        reference.
      </p>
      {loading && <p role="status">Loading simulations…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => {
              setLoading(true);
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Retry loading
          </button>
        </div>
      )}
      {!loading && !error && !runs.length && (
        <p>No saved order simulations. Simulate orders to create one.</p>
      )}
      {!!runs.length && !selected.length && <p>Select up to four runs above.</p>}
      <div className="uw-comparison-bars" aria-label="Net contribution in euros">
        {selected.map((r) => (
          <button
            key={r.simulation_id}
            aria-pressed={detail?.simulation_id === r.simulation_id}
            onClick={() => setInspected(r.simulation_id)}
          >
            <strong>
              {name(r)}
              {reference === r ? " · Ref" : ""}
            </strong>
            <span className="uw-diverging" aria-hidden="true">
              <i
                style={{
                  left:
                    r.summary.net_contribution_eur < 0
                      ? 50 - (Math.abs(r.summary.net_contribution_eur) / extent) * 50 + "%"
                      : "50%",
                  width: (Math.abs(r.summary.net_contribution_eur) / extent) * 50 + "%",
                  background: r.summary.net_contribution_eur < 0 ? "var(--error)" : "var(--teal)",
                }}
              />
            </span>
            <span>
              {money(r.summary.net_contribution_eur)}
              {!r.submitted_portfolio_feasible && <small> · Portfolio needs attention</small>}
            </span>
          </button>
        ))}
      </div>
      {!!selected.length && (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Saved order simulation comparison</caption>
            <thead>
              <tr>
                <th>Run</th>
                <th>Net contribution</th>
                <th>Change vs reference</th>
                <th>Executed orders</th>
                <th>Final SoC</th>
                <th>Portfolio / schedule</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((r) => (
                <tr key={r.simulation_id}>
                  <td>
                    <button className="ws-row-link" onClick={() => setInspected(r.simulation_id)}>
                      {name(r)}
                    </button>
                  </td>
                  <td>
                    {money(r.summary.net_contribution_eur)}
                    {r.summary.infeasible_order_count > 0 && (
                      <small> · Remaining schedule only</small>
                    )}
                  </td>
                  <td>
                    {r === reference
                      ? "Reference"
                      : money(
                          r.summary.net_contribution_eur - reference.summary.net_contribution_eur,
                        )}
                  </td>
                  <td>
                    {r.summary.executed_order_count}/{r.summary.submitted_order_count}
                  </td>
                  <td>{r.summary.final_soc_mwh} MWh</td>
                  <td>
                    {simulationPresentation(r).portfolioLabel}
                    <small>
                      {" "}
                      · Schedule {r.executed_schedule_feasible ? "feasible" : "needs attention"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && (
        <div className="uw-run-detail">
          <h3>{name(detail)} · Saved configuration</h3>
          <p>{simulationPresentation(detail).scope}</p>
          <SimulationAssumptions result={detail} />
          <dl>
            <div>
              <dt>Delivery</dt>
              <dd>
                {detail.delivery_date} · {detail.market.product_minutes} min
              </dd>
            </div>
            <div>
              <dt>Forecast</dt>
              <dd>
                {detail.forecast.source_name} · {detail.forecast_points.length} prices
              </dd>
            </div>
            <div>
              <dt>Battery</dt>
              <dd>
                {detail.battery.capacity_mwh} MWh · charge {detail.battery.max_charge_power_mw} MW ·
                discharge {detail.battery.max_discharge_power_mw} MW
              </dd>
            </div>
            <div>
              <dt>SoC</dt>
              <dd>
                {detail.battery.min_soc_mwh}–{detail.battery.max_soc_mwh} MWh · initial{" "}
                {detail.battery.initial_soc_mwh} · reserve {detail.battery.target_soc_mwh}
              </dd>
            </div>
          </dl>
          <details>
            <summary>All saved inputs</summary>
            <pre>
              {JSON.stringify(
                {
                  battery: detail.battery,
                  market: detail.market,
                  forecast: detail.forecast,
                  prices: detail.forecast_points,
                  orders: detail.submitted_orders,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
