# IWB BESS Day-Ahead Workbench

Interview prototype for a 100 MWh / 50 MW battery participating in a configurable Day-Ahead auction. One unified workbench simulates trader-entered Market and Limit orders against an entered price forecast and graphs the resulting battery schedule. The active UI focuses on manual order entry and simulation; optional optimizer and comparison pages are archived for future reuse.

## Homework workflow

1. Use **Load forecast** (or **Replace forecast**) to upload a complete Day-Ahead price forecast (CSV), paste CSV data, or preview the illustrative demo. Review and apply the validated preview. **Edit prices** makes targeted adjustments afterwards, showing the original forecast, edited prices and interval differences.
2. Click **Add order** to open a staged ticket. Choose any delivery interval, BUY/SELL, Market/Limit and volume; enter a price for Limit orders. Nothing is inserted until **Add order** confirms the ticket. Cancel leaves the case unchanged. Select an existing row to edit it; changes update the draft and require re-simulation. Market orders have no limit-price condition. Price-accepted orders remain subject to physical feasibility.
3. Run the simulation to process orders chronologically through the battery state of charge.
4. Inspect aligned price, power, state-of-charge and contribution tracks with synchronized floating tooltips (hover or arrow keys). Click or press Enter to open interval details, including idle periods. The order editor's **View battery schedule** opens the selected order's current result. Interval Detail combines schedule and order outcomes in one table; the Columns menu limits the table to five selectable values plus Delivery and Orders.
5. Revise entered orders or forecast prices and re-simulate to evaluate changes. Fresh sessions start without orders; saved drafts are restored and demo inputs require an explicit action.
6. Saved history restores complete simulation inputs and evidence. The dedicated comparison and validation pages are archived; battery safety checks still run during simulation and issues remain visible in order outcomes.

The entered forecast is deliberately used as the simulated auction clearing and settlement price. Eligible orders in a delivery interval are checked as one all-or-nothing batch; opposing BUY/SELL orders in the same interval are unsupported. The prototype does not model clearing probability, partial fills, price impact, a live market feed or order submission. Interval SoC evidence belongs to the whole batch, not to an invented ordering within that interval.

Inputs and their last result share one session-persisted workspace. Editing inputs marks prior results stale; late responses do not validate a newer draft. The canonical UTC delivery grid handles 23/25-hour daylight-saving days as well as normal days. Blank prices are not interpreted as zero.

Implementation and verification details are in [docs/WORKSPACE_IMPLEMENTATION.md](docs/WORKSPACE_IMPLEMENTATION.md).

For a file-by-file reading path, module ownership and mathematical conventions, see
[docs/CODE_GUIDE.md](docs/CODE_GUIDE.md).

### Forecast import and History

CSV imports are validated by `POST /api/forecast/import`, not just parsed in the browser. Files use UTF-8, a decimal point and the exact header `delivery_start,price_eur_mwh`. Timestamps must include a UTC offset. All selected-day intervals must occur exactly once, chronologically, including daylight-saving 23/25-hour days. The maximum file size is 256 KB. Load forecast offers a date-specific blank template and a separate upload-ready illustrative example CSV; fill every price before uploading the blank template. Errors identify the affected rows without replacing the current forecast. A filled mock fixture is also available at `tests/fixtures/da-forecast-2026-09-09.csv`. Manual changes pass backend validation before applying.

Snapshots retain forecast source/version, content hash and import/edit provenance. Loading or editing never changes a previously saved result: re-simulate to update the evidence. The provider catalogue identifies the demo as available and Volue/Montel as **not connected**. Live provider adapters and credentials are not included; commercial data may currently be imported as CSV. No disconnected provider silently falls back to demo prices.

**History** is the single entry point for saved simulations, proposals, exact inputs and recorded activity. The former `/audit` URL redirects there. Viewing a snapshot does not restore it; use the explicit Restore simulation/Open proposal action.

Simulate orders reconstructs dispatch deterministically from the trader's entered orders. Generate proposal solves dispatch as a mixed-integer linear program with SciPy/HiGHS. Both operations reuse the same domain economics and physical-validation modules. Optimization settings affect proposal generation only; changing them does not reinterpret an already simulated order portfolio.

## Decision semantics

- `Minimum end-of-day SoC` is a reserve floor, not an exact terminal target.
- Equivalent full cycles use total battery-side throughput divided by twice nominal capacity.
- Purchases, degradation and configured per-MWh exchange/clearing fees are deducted from sales to calculate expected net contribution.
- Expected, downside, upside and peak-compression cases alter illustrative prices only. Asset availability is configured independently using local-time windows that are mapped to the selected product resolution.
- Proposal changes and their audit evidence are committed in one SQLite transaction.
- Continuous MILP quantities are floored to the configured auction increment, reconstructed, and repaired until the executable order package passes the physical validator.
- The scenario view evaluates each candidate's same executable orders under downside, expected and upside prices with explicit illustrative probabilities; the selected decision posture can therefore change the recommended dispatch and order portfolio.
- The saved-run comparison keeps each completed simulation immutable, supports two to four selected runs and one explicit reference, and reveals the exact market, strategy, battery and availability inputs behind every result.
- Forecast inputs carry source, version and bidding-zone provenance. A trader can use the built-in illustrative curve or paste a complete 24-hour hourly/quarter-hourly curve; incomplete curves are rejected before optimization.
- End-of-day energy can use the hard minimum reserve alone, a configured terminal value, an illustrative next-day forecast proxy, or a multi-day opportunity-value policy. Cash contribution and continuation value remain separate.
- Every generated order exposes an efficiency-, wear- and fee-adjusted break-even price. Decision sensitivity fully re-optimizes feasible operating levers (reserve, cycle budget, operating power, SoC window and availability) under the saved forecast; fixed asset facts such as nominal capacity, efficiency and degradation assumptions remain model inputs rather than trader controls.
- Exchange fees distinguish an unconfigured/excluded contract value from a confirmed numeric zero. The ECC clearing fee remains a documented public-tariff assumption.
- Optimization records use audit schema v5; order-simulation records use v6. Saved records preserve the forecast and relevant model/input provenance for their workflow.
- Executable orders are checked against strict SoC boundaries after market-increment rounding. Numerical solver tolerance, energy-balance tolerance and display precision are deliberately separate concepts.

## Safety boundary

- Demonstration and simulation only; no live exchange submission.
- Swiss market details such as product duration, bidding zone, gate closure, and increments are configuration assumptions and must be confirmed with IWB.
- Internal timestamps are UTC. The single header selector displays CET/CEST or UTC consistently; it does not change the market delivery calendar, order instants or financial calculations.

## Run locally

```powershell
# Backend
python -m pip install -r requirements-dev.txt
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8100

# Frontend (second terminal)
cd frontend
npm ci
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8100"
npm run dev
```

Open <http://127.0.0.1:3100> and API docs at <http://127.0.0.1:8100/docs>.

## Deploy on Render

The included multi-stage `Dockerfile` exports the Next.js frontend and serves it
from the FastAPI backend, so the complete prototype runs as one web service.

1. Create a Render **Web Service** from this repository.
2. Select the **Docker** runtime and the **Free** instance type.
3. No environment variables are required for the illustrative demo dataset.

Render provides `PORT` automatically. The service exposes `/health`, the API at
`/api/*`, and the workbench UI at `/`. Local SQLite audit data is ephemeral on a
free Render instance and can be lost whenever the service sleeps or redeploys.

## Verify

```powershell
python -m pytest tests
python -m ruff check backend tests
python -m ruff format --check backend tests
cd frontend
npm run format:check
npm run check:structure
npm run typecheck
npm run lint
npm test
npm run build
```

GitHub Actions repeats these checks and builds the production container on every push and pull request.
