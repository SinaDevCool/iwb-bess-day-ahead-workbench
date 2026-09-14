# IWB BESS Day-Ahead Workbench

Interview prototype for a configurable 100 MWh / 50 MW battery. One editable workspace has two views: **Auction Orders** and **Dispatch & Economics**. React/Next.js renders the frontend; FastAPI provides validation, simulation, optimization and history.

## Homework workflow

1. Select the delivery date and product duration. Configure battery limits and costs.
2. **Load forecast / Replace forecast** accepts a complete CSV upload, pasted CSV or an explicitly selected illustrative example. Review and **Apply forecast**; **Edit prices** stages targeted edits afterwards.
3. **Add order** opens a staged Market/Limit BUY/SELL ticket. Confirm to insert it; cancel changes nothing. Existing rows can be edited or removed.
4. **Simulate battery dispatch** evaluates the entered orders chronologically. It does not optimize or change their quantities.
5. **Dispatch & Economics** shows aligned forecast, signed power, stored-energy and contribution charts. Hover or arrow keys inspect intervals; click or Enter opens the separate interval evidence. **Interval Detail** shows order outcomes and links back to editing.
6. Correct an order, then simulate again. Changed inputs mark prior results outdated; old cards are not evidence about the edited portfolio.
7. **History** is the entry point for saved results and their inputs. Viewing a record does not silently restore it. Fresh sessions have no orders; example inputs require explicit selection.

A reproducible demonstration, expected results and acceptance record are in [the interview runbook](docs/interview-runbook.md). Module ownership is in [the code guide](docs/CODE_GUIDE.md).

## Optional suggestions and repairs

**Re-optimize** offers the existing suggestion/improvement and portfolio-repair workflows. These use MILP and the shared validation/economics services. They produce previews, not exchange orders. Explicit Apply/Add changes the draft; Undo restores the previous draft. Simulate again to create the updated schedule result.

Manual and protected orders remain unchanged unless revision is permitted. Permission is not a requirement to change an order. Balancing additions permit new orders, but do not force them. See [suggestions](docs/additional-order-suggestions.md), [re-optimization](docs/suggestion-reoptimization.md) and [repair](docs/portfolio-repair.md).

The former **Generate proposal**, **Proposal settings**, **Physical Validation** and **Compare Runs** screens are archived or legacy functionality, not steps in the active homework journey. Their historical code and release notes remain for reuse; physical checks still run in the current simulator.

## Forecast format

CSV imports use `POST /api/forecast/import`. Use UTF-8, decimal points and the exact header `delivery_start,price_eur_mwh`. Timestamps need a UTC offset. Every interval of the selected local day must occur exactly once, in chronological order: normally 24 hourly or 96 quarter-hourly rows, with DST days handled by the canonical delivery grid. Maximum file size: 256 KB.

Download the matching blank template or reuse [the illustrative fixture](tests/fixtures/da-forecast-2026-09-09.csv). Blank prices are not zero; zero and negative numbers are valid. Failed validation does not replace the forecast. Imports and edits retain source/provenance, and saved results retain their own inputs.

Splitting hourly data preserves its profile; it does not create a genuinely new quarter-hour forecast or re-optimize orders. Product conversion requires confirmation; incompatible quarter-hour inputs cannot silently merge.

## Simulation boundary

This prototype evaluates entered orders using the forecast as the assumed clearing and settlement price. It calculates a simulated battery dispatch schedule; it does not submit orders or control a battery.

Full allocation is assumed for qualifying, physically feasible batches, including at-limit orders. Actual exchange clearing, partial allocation, price impact and opposing-trade netting are not modelled. Physical exclusion is a simulator decision, not an exchange rejection. Live commercial forecast providers are not connected.

[Order simulation policies](docs/ORDER_SIMULATION_POLICIES.md) are the authoritative execution rules. [Assumptions and boundaries](docs/assumptions-and-boundaries.md) describes configuration defaults and remaining real-world requirements.

## Run locally

From the repository root, in two terminals:

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

Open <http://localhost:3100> and API docs at <http://127.0.0.1:8100/docs>.
`npm run build` produces a static export; do not use `next start` to serve it.
Production serves the export through FastAPI in the Docker image.

## Deploy on Render

The multi-stage Dockerfile builds the frontend and serves the complete app on Render's PORT (default 10000). The configured service automatically deploys pushes to main. No external forecast credentials are required for illustrative data. Health is exposed at `/health`, APIs at `/api/*`, and the workbench at `/`.

SQLite history on an ephemeral Render filesystem can be lost on sleep/redeploy; browser draft storage is a convenience, not a durable backup. This deployment is not a production trading service.

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

GitHub Actions repeats checks and builds the production container on pushes and pull requests. Use the runbook for the acceptance demonstration; historical audit documents describe their release, not necessarily today's interface.
