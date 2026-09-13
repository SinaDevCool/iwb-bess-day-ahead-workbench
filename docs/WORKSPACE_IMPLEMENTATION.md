# Unified homework workspace

## Scope and reuse

The primary workflow is forecast input + explicit Market/Limit order input -> deterministic simulation -> graphical battery schedule. The original MILP remains an optional proposal generator and advanced analysis tool. Neither workflow sends orders to an exchange.

- `frontend/src/components/workspace/order-workspace.tsx` owns draft, result snapshot, stale-state handling, forecast/settings dialogs and explicit proposal apply/undo.
- `workspace/order-evidence.tsx` reuses one order editor and simulation-evidence presentation.
- `workspace/workspace-history.tsx` restores saved inputs and results by run type.
- `app/page.tsx` now mounts only `UnifiedWorkbench`; the old advanced-page controller and mode switch are removed. Auction Orders, Dispatch & Economics, Physical Validation and Compare Runs share that controller.
- `workspace/simulation-validation.tsx` and `lib/simulation-evidence.ts` present observed/allowed values from the immutable order-simulation snapshot, with explicit headroom, issues and not-evaluated states. Backend validation remains authoritative.
- `workspace/simulation-comparison.tsx` compares saved execution results; existing `comparison/saved-run-comparison.tsx` remains explicitly scoped to optimizer proposals. No mixed result-type casts are used.
- `analytics-charts.tsx` and `interval-results-table.tsx` are reused for simulation economics and interval evidence. Obsolete standalone order table, KPI component and two-run chart are removed.
- `app/unified.css` applies the advanced-style configuration sidebar and responsive result shell. Narrow screens start with configuration collapsed; all editors remain accessible from the same toolbar.
- `dispatch-chart.tsx` provides shared price, MW and MWh plots with actual interval-end SoC timestamps.
- `backend/domain/delivery_grid.py` is the canonical DST-aware delivery grid reused by validation and forecast generation.
- Existing simulation, optimizer, economics, physical validation and repository services remain authoritative. No second optimizer or economic calculation engine was introduced.

## Evidence and API boundaries

`POST /api/proposal-preview` creates a saved optimization proposal and returns editable Limit orders; it does not apply them. `GET /api/workspace-history` combines typed run summaries. `POST /api/simulations/{id}/sensitivities` evaluates the saved proposal without inserting another history run. Optimization mutation endpoints reject order-simulation IDs.

Each submitted order has exactly one outcome. Price-condition evidence survives physical rejection. Shared interval SoC is identified as batch evidence. Terminal reserve failure invalidates the submitted portfolio even when earlier orders executed. Monetary components reconcile at cent precision. Independent physical validation checks energy, duration and delivery-grid consistency.

Cash contribution excludes continuation value. Risk postures compare candidate schedules; they must not be described as a globally robust stochastic optimum. Next-day/multi-day continuation assumptions are proxies, not a full multi-day dispatch simulation. The two-hour task assumption is 100 MWh / 50 MW nominal charge or discharge duration.

## Verification

- Backend: 115 pytest tests passed, including exact grids, DST, naive/off-grid timestamps, batch evidence, terminal failure, cash reconciliation, proposal round-trip, typed history filtering and no-duplicate sensitivity history.
- Frontend: 36 Vitest tests passed, covering draft preservation, explicit proposal apply/undo, stale in-flight results, blank/ambiguous forecast input, chart timing, legacy URL mapping and saved-snapshot validation/headroom.
- ESLint and Next.js production build (including TypeScript) passed.
- Local browser checks exercised price rejection (BUY limit 10 below forecast 32), physical reserve failure, proposal preview/apply/re-simulation (8/8 orders; contribution reconciled to €6,201.25), undo, separate proposal comparison, invalid battery settings and blank/negative forecast input.
- A 15-minute BUY of 10 MW produced 2.5 grid MWh, 52.372 MWh final SoC and −€144.66 contribution. Laptop (1366×768) and narrow (390×844) layouts were inspected; narrow layout had no document-level horizontal overflow.

This is a simulation prototype, not a production exchange gateway. Authentication, telemetry, real clearing, partial fills and live execution are outside the homework scope.
