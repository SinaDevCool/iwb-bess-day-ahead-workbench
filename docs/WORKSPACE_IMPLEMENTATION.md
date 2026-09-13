# Unified homework workspace

## Scope and reuse

The primary workflow is forecast input + explicit Market/Limit order input -> deterministic simulation -> graphical battery schedule. The original MILP remains an optional proposal generator and advanced analysis tool. Neither workflow sends orders to an exchange.

- `frontend/src/components/workspace/order-workspace.tsx` composes the views. `use-workbench.ts` connects one shared state owner to snapshot validation, session persistence and explicit action hooks.
- `workspace/order-evidence.tsx` provides the order editor; `simulation-results.tsx` owns simulation-evidence presentation. Battery and cost editors are independent staged forms.
- `workspace/workspace-history.tsx` restores saved inputs and results by run type.
- `app/page.tsx` now mounts only `UnifiedWorkbench`; the old advanced-page controller and mode switch are removed. Auction Orders, Dispatch & Economics, Physical Validation and Compare Runs share that controller.
- `workspace/simulation-validation.tsx` and `lib/simulation-evidence.ts` present observed/allowed values from the immutable order-simulation snapshot, with explicit headroom, issues and not-evaluated states. Backend validation remains authoritative.
- `workspace/simulation-comparison.tsx` compares saved execution results; existing `comparison/saved-run-comparison.tsx` remains explicitly scoped to optimizer proposals. No mixed result-type casts are used.
- `analytics-charts.tsx` and `interval-results-table.tsx` are reused for simulation economics and interval evidence. Obsolete standalone order table, KPI component and two-run chart are removed.
- `app/unified.css` applies the advanced-style configuration sidebar and responsive result shell. Narrow screens start with configuration collapsed; all editors remain accessible from the same toolbar.
- `dispatch-chart.tsx` provides shared price, MW and MWh plots with actual interval-end SoC timestamps.
- `backend/domain/delivery_grid.py` is the canonical DST-aware delivery grid reused by validation and forecast generation.
- Existing simulation, optimizer, economics, physical validation and repository services remain authoritative. No second optimizer or economic calculation engine was introduced.

## Forecast editing and time presentation

- The header's time-zone preference changes display and clock-only manual-entry interpretation, never the market calendar or request identity. `time-preference.tsx` owns that preference; `lib/time-presentation.ts` owns formatting. Zurich uses seasonal CET/CEST; UTC is the alternative. Repeated autumn times have first/second labels and date boundaries remain visible. Machine-readable CSVs retain explicit offsets.
- `use-forecast-loader.ts` stages upload/demo previews; Apply is still the only shared-draft mutation. Blank templates require prices; the separate illustrative example CSV is upload-ready. `forecast-csv.ts` owns both serializers. The existing backend import endpoint returns its compatible `detail` message plus structured row issues, presented by `forecast-issues.tsx`. Empty lines are ignored, but missing prices are not zero. Old requests cannot overwrite a newer preview.
- `use-forecast-editor.ts` owns opening, source and staged values. `forecast-price-table.tsx` renders their differences; the existing `ForecastPlot` renders edited/source lines and adjusted-interval bands. Undo returns to the session opening; Restore source is separately confirmed; Cancel/X/Escape protect pending edits. Server validation precedes Apply. An unchanged Apply does not invalidate the result.
- Resolution conversion resamples the recorded original prices on the same UTC overlaps as entered prices. Splitting preserves prices; merging uses the mean source price. Stale content hashes are removed and adjustment counts are recomputed. An incompatible old baseline is not plotted against a new grid.
- Order-row cells delegate selection to the existing row button/opener. The same `OrderTicket` is used at every width; keyboard focus and the existing draft update path remain unchanged. A market order has no price-limit input; the forecast is context, not a second order-entry chart.

## Snapshot and chart simplification

- `forecast-snapshot.tsx` is the shared provenance display in the sidebar, import
  preview, price editor and saved simulation. Case update time is separate from
  provider issue/import time; absent legacy dates remain explicitly unknown.
- Calculation freshness excludes provenance-only changes. Full draft identity
  still protects asynchronous requests. Saved results retain their own forecast.
- Four chart-local floating tooltips share one interval and pointer position.
  Hover does not change layout or write selection into navigation. Arrow keys
  inspect, Enter/click opens interval details, and Escape dismisses tooltips.
  The former pin inspector and order strip are removed, not hidden duplicates.
- Interval rows expand for both orders and idle periods. The top contribution
  metric and interval contribution chart remain; the duplicate simulation
  financial summary below the charts is removed.
- Forecast edits use solid blue against a dashed grey baseline and amber changed
  intervals. The configuration shell delegates market/battery content to small
  section components, with optional proposal settings kept separate.
- Simulation evaluates entered orders deterministically; it must not silently
  re-optimize them. The MILP remains behind Generate proposal. Display timezone
  changes preserve UTC delivery instants, prices, quantities and economics.

## Evidence and API boundaries

### Staged order entry and compact editing

- `add-order-dialog.tsx` owns only an uncommitted new ticket. It reuses `OrderRow`
  and `validateOrders`; Add inserts once through the existing case controller,
  while Cancel, Escape and close leave the case untouched.
- Delivery options come from the full UTC forecast grid, never the existing
  orders. Deleted intervals remain available; duplicate interval orders are valid.
  Initial volume and limit are blank; Market removes the limit without inventing
  a new bid price when switching back to Limit.
- Existing tickets remain live edits. Price eligibility and saved simulation status
  stay distinct. Calculation details collapse explanations and identifiers; the
  full-width schedule action is unavailable for missing or outdated results.
- The forecast sidebar shows its update timestamp and actions, not a success
  fraction or source description. Missing/invalid prices remain actionable;
  provenance remains in forecast dialogs. No backend or optimization logic changed.

`POST /api/proposal-preview` creates a saved optimization proposal and returns editable Limit orders; it does not apply them. `GET /api/workspace-history` combines typed run summaries. `POST /api/simulations/{id}/sensitivities` evaluates the saved proposal without inserting another history run. Optimization mutation endpoints reject order-simulation IDs.

Each submitted order has exactly one outcome. Price-condition evidence survives physical rejection. Shared interval SoC is identified as batch evidence. Terminal reserve failure invalidates the submitted portfolio even when earlier orders executed. Monetary components reconcile at cent precision. Independent physical validation checks energy, duration and delivery-grid consistency.

Cash contribution excludes continuation value. Risk postures compare candidate schedules; they must not be described as a globally robust stochastic optimum. Next-day/multi-day continuation assumptions are proxies, not a full multi-day dispatch simulation. The two-hour task assumption is 100 MWh / 50 MW nominal charge or discharge duration.

## Earlier workflow verification

The counts below describe the earlier workflow implementation, not the current
suite size. See `CODE_GUIDE.md` for refactoring boundaries and README for current commands.

- Backend: 115 pytest tests passed, including exact grids, DST, naive/off-grid timestamps, batch evidence, terminal failure, cash reconciliation, proposal round-trip, typed history filtering and no-duplicate sensitivity history.
- Frontend: 36 Vitest tests passed, covering draft preservation, explicit proposal apply/undo, stale in-flight results, blank/ambiguous forecast input, chart timing, legacy URL mapping and saved-snapshot validation/headroom.
- ESLint and Next.js production build (including TypeScript) passed.
- Local browser checks exercised price rejection (BUY limit 10 below forecast 32), physical reserve failure, proposal preview/apply/re-simulation (8/8 orders; contribution reconciled to €6,201.25), undo, separate proposal comparison, invalid battery settings and blank/negative forecast input.
- A 15-minute BUY of 10 MW produced 2.5 grid MWh, 52.372 MWh final SoC and −€144.66 contribution. Laptop (1366×768) and narrow (390×844) layouts were inspected; narrow layout had no document-level horizontal overflow.

This is a simulation prototype, not a production exchange gateway. Authentication, telemetry, real clearing, partial fills and live execution are outside the homework scope.
