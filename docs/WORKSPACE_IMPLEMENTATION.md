# Unified homework workspace

## Scope and reuse

The primary workflow is forecast input + explicit Market/Limit order input -> deterministic simulation -> graphical battery schedule. The original MILP remains an optional proposal generator and advanced analysis tool. Neither workflow sends orders to an exchange.

- `frontend/src/components/workspace/order-workspace.tsx` owns draft, result snapshot, stale-state handling, forecast/settings dialogs and explicit proposal apply/undo.
- `workspace/order-evidence.tsx` reuses one order editor and simulation-evidence presentation.
- `workspace/workspace-history.tsx` restores saved inputs and results by run type.
- `dispatch-chart.tsx` provides shared price, MW and MWh plots with actual interval-end SoC timestamps.
- `backend/domain/delivery_grid.py` is the canonical DST-aware delivery grid reused by validation and forecast generation.
- Existing simulation, optimizer, economics, physical validation and repository services remain authoritative. No second optimizer or economic calculation engine was introduced.

## Evidence and API boundaries

`POST /api/proposal-preview` creates a saved optimization proposal and returns editable Limit orders; it does not apply them. `GET /api/workspace-history` combines typed run summaries. `POST /api/simulations/{id}/sensitivities` evaluates the saved proposal without inserting another history run. Optimization mutation endpoints reject order-simulation IDs.

Each submitted order has exactly one outcome. Price-condition evidence survives physical rejection. Shared interval SoC is identified as batch evidence. Terminal reserve failure invalidates the submitted portfolio even when earlier orders executed. Monetary components reconcile at cent precision. Independent physical validation checks energy, duration and delivery-grid consistency.

Cash contribution excludes continuation value. Risk postures compare candidate schedules; they must not be described as a globally robust stochastic optimum. Next-day/multi-day continuation assumptions are proxies, not a full multi-day dispatch simulation. The two-hour task assumption is 100 MWh / 50 MW nominal charge or discharge duration.

## Verification

- Backend: 115 pytest tests passed, including exact grids, DST, naive/off-grid timestamps, batch evidence, terminal failure, cash reconciliation, proposal round-trip, typed history filtering and no-duplicate sensitivity history.
- Frontend: 16 Vitest tests passed, covering draft preservation, explicit proposal apply/undo, stale in-flight results, blank/ambiguous forecast input, chart timing and validation.
- ESLint and Next.js production build (including TypeScript) passed.
- Local browser checks exercised price rejection, physical reserve failure, proposal preview/apply/re-simulation, comparison, and invalid battery settings.

This is a simulation prototype, not a production exchange gateway. Authentication, telemetry, real clearing, partial fills and live execution are outside the homework scope.
