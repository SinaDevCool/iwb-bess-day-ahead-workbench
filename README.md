# IWB BESS Day-Ahead Workbench

Interview prototype for a 100 MWh / 50 MW battery participating in a configurable Day-Ahead auction. The product converts a price forecast and battery assumptions into a feasible dispatch, scenario comparison, explainable economics, and a validated preview-only order proposal.

The dispatch is solved as a mixed-integer linear program with SciPy/HiGHS. It explicitly enforces SoC balance and bounds, power/grid limits, unavailable periods, minimum terminal SoC, cycle throughput, and mutually exclusive charging/discharging. A single domain economics module supplies battery-side energy, revenue, purchase, degradation, transaction-fee and contribution calculations to dispatch, orders, edits and validation.

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
