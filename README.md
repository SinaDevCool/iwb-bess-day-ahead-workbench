# IWB BESS Day-Ahead Workbench

Interview prototype for a 100 MWh / 50 MW battery participating in a configurable Day-Ahead auction. One unified workbench simulates trader-entered Market and Limit orders against an entered price forecast and graphs the resulting battery schedule. Optional optimization generates an explicitly applied order proposal from the same battery and forecast inputs. There is no separate advanced-mode draft or duplicate order-entry page.

## Homework workflow

1. Enter or edit the hourly Day-Ahead price forecast.
2. Enter BUY/SELL orders and choose `Market` or `Limit` for every order. Market orders have no limit-price condition; Limit orders pass the price condition only when the entered forecast crosses their side-specific limit. Every price-accepted order remains subject to physical feasibility.
3. Run the simulation to process orders chronologically through the battery state of charge.
4. Inspect executed, price-rejected and physically infeasible orders alongside separate, time-aligned price, power and state-of-charge charts, economics and validation findings.
5. Optionally generate an optimization proposal, review it, and explicitly apply it to the editable orders. Applying is reversible; generating alone never replaces the draft. Re-run the simulation to evaluate the applied orders.
6. Use Compare Runs for saved order simulations or explicitly scoped optimizer proposals. Saved history restores complete simulation inputs and evidence. Physical Validation inspects the saved executed schedule, including headroom and failed checks.

The entered forecast is deliberately used as the simulated auction clearing and settlement price. Eligible orders in a delivery interval are checked as one all-or-nothing batch; opposing BUY/SELL orders in the same interval are unsupported. The prototype does not model clearing probability, partial fills, price impact, a live market feed or order submission. Interval SoC evidence belongs to the whole batch, not to an invented ordering within that interval.

Inputs and their last result share one session-persisted workspace. Editing inputs marks prior results stale; late responses do not validate a newer draft. The canonical UTC delivery grid handles 23/25-hour daylight-saving days as well as normal days. Blank prices are not interpreted as zero.

Implementation and verification details are in [docs/WORKSPACE_IMPLEMENTATION.md](docs/WORKSPACE_IMPLEMENTATION.md).

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
- New decision records use audit schema v5 and preserve assumption provenance, the full forecast snapshot, scenario probabilities, forecast version, optimizer version and validation version.
- Executable orders are checked against strict SoC boundaries after market-increment rounding. Numerical solver tolerance, energy-balance tolerance and display precision are deliberately separate concepts.

## Safety boundary

- Demonstration and simulation only; no live exchange submission.
- Swiss market details such as product duration, bidding zone, gate closure, and increments are configuration assumptions and must be confirmed with IWB.
- Internal timestamps are UTC and trader-facing timestamps use `Europe/Zurich`.

## Run locally

```powershell
# Backend
python -m pip install -r requirements.txt
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8100

# Frontend (second terminal)
cd frontend
npm install
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
cd frontend
npm run lint
npm run build
```

GitHub Actions repeats these checks and builds the production container on every push and pull request.
