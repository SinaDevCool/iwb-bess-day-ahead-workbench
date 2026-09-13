# Code guide

## Start here

This repository has **one editable workbench**, two calculation workflows and one
shared battery/economics model. The frontend does not dispatch a physical asset or
submit orders to an exchange.

Read these files in this order:

1. `frontend/src/app/page.tsx` mounts the workbench.
2. `frontend/src/components/workspace/order-workspace.tsx` composes its shell/views.
3. `frontend/src/components/workspace/use-workbench.ts` connects state, validation and actions.
4. `backend/api/main.py` registers resource routers and serves the static export.
5. `backend/services/order_simulation_service.py` runs and saves an order simulation.
6. `backend/services/order_simulation_engine.py` assembles the result; `order_schedule.py` evaluates the chronological schedule.
7. `backend/domain/economics.py` defines the shared energy and contribution calculation.

## Frontend ownership

| Location | Responsibility |
| --- | --- |
| `components/workspace/workspace-state.ts` | Single shared draft, saved result, policy and selection state |
| `workspace-session.ts` | Recoverable session snapshot, startup restoration and unsaved-input warning |
| `use-workspace-navigation.ts` | Canonical tab links and browser navigation actions |
| `workspace-*-actions.ts` | Explicit load/restore, simulate, generate/apply/undo workflows |
| `workspace-adapters.ts` | Draft identity, request serialization and saved-order mapping |
| `configuration-panel.tsx`, `orders-view.tsx`, `comparison-view.tsx` | Views of that same controller; no second shared draft |
| `forecast-loader.tsx`, `forecast-editor.tsx` | Validated complete upload/preview versus targeted staged interval edits |
| `use-forecast-loader.ts`, `use-forecast-editor.ts`, `use-battery-editor.ts` | Staged editor state and requests; views do not own network workflows |
| `workspace-draft.ts`, `lib/price-input.ts`, `lib/session-preferences.ts` | Pure provenance updates, blank-aware price checks and optional browser storage |
| `battery-editor.tsx`, `cost-editor.tsx` | Separate staged asset and transaction-cost forms |
| `simulation-results.tsx` | Saved execution evidence, shared interval selection, charts and interval table |
| `dispatch-chart.tsx`, `lib/schedule-chart-data.ts` | Chart interactions/rendering versus pure boundary/interval data mapping |
| `components/schedule/` | Shared inspection hook, inspector and price/power/SoC/contribution tracks; one time coordinate system |
| `components/interval-table/` | Column definitions, optional preference persistence and expanded order evidence |
| `workspace-history.tsx`, `history-detail.tsx` | History requests/list versus read-only record details |
| `components/comparison/` | Optimizer comparison controller, chart, table, inspector and formatting |
| `types/` | API contracts grouped into shared, forecast, orders, simulation, optimization and history |
| `lib/api.ts` | HTTP transport/errors; generic TypeScript types are not runtime validation |

Draft numeric inputs remain strings while editing, so blank is distinguishable
from zero. Editors stage changes until Apply. A completed result retains its own
input identity; editing the draft marks it stale instead of relabelling old
evidence as current. The simulation request counter prevents an older successful
response from replacing a newer run. Proposal generation never implicitly replaces
orders: Apply does that, and Undo restores the previous draft.

## Backend ownership

| Location | Responsibility |
| --- | --- |
| `api/main.py` | Lifespan, CORS, exception translation, routers and static mount |
| `api/routes/` | Configuration/forecast, simulations, history and proposal HTTP adapters |
| `domain/schemas/` | Pydantic contracts and shared request validation |
| `domain/delivery_grid.py` | UTC interval starts for the configured local day, including DST |
| `domain/economics.py` | Grid energy, battery throughput, SoC delta and cash contribution |
| `services/order_simulation_service.py` | Clock/ID assignment and atomic result/event persistence |
| `services/order_simulation_engine.py` | Deterministic full-fill calculation, no database or clock reads |
| `services/forecast_resolution.py` | One explicit forecast/delivery-grid resolver for both calculation workflows |
| `services/order_schedule.py`, `order_outcome_evidence.py` | Chronological batch settlement versus outcome evidence/reconciliation |
| `services/order_execution_rules.py` | Price eligibility, physical batch checks and individual outcome mapping |
| `services/simulation_service.py` | Optimization workflow orchestration and saved result assembly |
| `services/horizon_service.py` | Explicit terminal-value/proxy policy |
| `services/risk_service.py` | Score three independently optimized candidates under price cases |
| `services/executable_order_service.py` | Quantization and causal physical repair of proposals |
| `services/proposal_service.py` | Trader revisions, revalidation, approval and export content |
| `services/proposal_pricing.py`, `proposal_revalidation.py` | Forecast-based order repricing versus complete proposal reconstruction |
| `services/sensitivity_service.py` | Re-optimize operating-lever changes without adding history runs |
| `services/sensitivity_definitions.py`, `sensitivity_evaluation.py` | Typed lever definitions versus one re-optimization case |
| `services/optimization_summary.py` | Saved financial/physical summary, separate from solver orchestration |
| `optimization/milp_model.py` | Objective, bounds, integrality and sparse constraint matrix |
| `optimization/milp_optimizer.py` | SciPy/HiGHS solve and solver evidence |
| `optimization/dispatch_decoder.py` | Convert solver variables to a reconciled dispatch ledger |
| `validation/` | Separate dispatch, market-order and reconstructed-proposal checks |
| `validation/dispatch_row_checks.py`, `proposal_checks.py` | Local checks; parent validators own chronology and result aggregation |
| `db/repository.py` | SQLite persistence; result revision and audit event share a transaction |

`domain/models.py`, `validation/validators.py` and
`services/decision_support_service.py` are small compatibility re-export modules.
They do not contain second implementations. Existing imports and API routes remain
valid while a reader can navigate to the focused implementation.

## Mathematical conventions worth knowing

- `dt = product_minutes / 60`; grid MWh = non-negative order MW × dt.
- `eta = sqrt(round_trip_efficiency)` assumes symmetric charge/discharge efficiency.
- BUY increases SoC by grid MWh × eta; SELL decreases it by grid MWh / eta.
- Wear is charged on battery-side throughput; transaction fees on grid-side energy.
- Cash contribution = sales − purchases − wear − transaction fees. At negative
  prices purchases can be negative, representing a cash inflow.
- A cycle is total battery throughput / (2 × nominal capacity). The daily cycle
  budget is not a minimum time between trades.
- SciPy minimizes `c @ x`: purchases and costs are positive coefficients, sales
  and terminal value negative. The fixed reserve-value constant is omitted from
  the solver objective because it cannot affect the optimum.
- Continuation value is separate from daily cash. Next-day/multi-day policies are
  illustrative continuation proxies, not a full multi-day dispatch simulation.
- Risk posture chooses the best of three candidate schedules; it does not solve
  a global robust/stochastic MILP. A downside score is not a no-loss guarantee.
- Order limit controls price eligibility. The entered forecast is the assumed
  clearing/settlement price. This is why changing a limit need not change cash
  unless execution changes. Break-even is a model heuristic, not a live bid price.
- Same-interval orders are one physical batch. Conflicting sides are unsupported;
  infeasible batches are not silently clipped. All following intervals inherit
  the previous interval's resulting SoC.

## Styles and comments

`app/globals.css` is the only stylesheet import in the root layout. Its ordered
manifest includes the original styles, then `workspace.css`, then `unified.css`.
Feature manifests reference smaller sections (selection, outcomes, inspectors,
editors, plots and responsive rules). The shared loading-icon animation has one
owner, `styles/motion.css`, including reduced-motion behavior. Other legacy and
override selectors are retained when they still participate in the cascade:
matching selector text alone is not proof of redundancy. Changing import order
is a visual change. The refactor preserved the sequence of complete CSS AST nodes.

Comments explain units, ownership, side effects, invariants and non-obvious model
assumptions. They should not narrate every assignment. Do not split a coherent
equation or JSX structure solely to meet an arbitrary line-count limit.

## Verification and future changes

`tests/conftest.py` isolates **every backend test** in a temporary SQLite database.
The `client` fixture runs FastAPI's lifespan. Tests must not touch the demo database.
`tests/test_refactor_boundaries.py` checks compatibility exports, deterministic
calculation, coefficient signs, shared DST validation and filtered pagination.
Frontend tests cover draft preservation, inputs, forecast parsing/upload, history,
chart timing and the extracted adapters.

Run the commands in README before committing. Keep formatting-only changes separate
from future business-rule changes where possible. No exchange integration, market
assumption or optimizer objective should change merely as part of a refactor.

`npm run check:structure` enforces a 300-line ceiling on production Python,
TypeScript/TSX and CSS files and rejects duplicate/cyclic stylesheet imports.
Tests are excluded so fixtures do not force artificial production abstractions.
The ceiling is a regression guard, not the design goal: views can contain a
cohesive render tree, while workflows, calculations and side effects belong in
named helpers. New comments should explain why a boundary exists and what must
remain true, rather than repeat the code in English.

## How to trace a change

- Forecast upload: loader view → loader hook → forecast import route/service →
  preview → explicit Apply → shared draft. A preview never edits the saved result.
- Simulate orders: workspace simulation action → order simulation service →
  forecast resolution → chronological schedule → outcome evidence → saved result.
- Generate proposal: proposal action → simulation service → MILP model/solver →
  executable-order repair/validation → summary. Apply remains a separate action.
- Inspect a chart interval: shared inspection hook → all four tracks and inspector;
  pure chart-data mapping retains interval starts and energy boundary timestamps.
- Compare runs: comparison controller loads immutable snapshots; selectors derive
  labels/duplicates; picker, chart, table and inspector only present that state.
