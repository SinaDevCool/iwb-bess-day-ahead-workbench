# IWB BESS Day-Ahead Workbench

An interactive interview prototype for evaluating day-ahead orders against a battery’s operating limits. Enter a price forecast and Market or Limit orders, simulate battery dispatch, and inspect the resulting schedule, stored energy and financial contribution.

[Live demo](https://iwb-bess-day-ahead-workbench.onrender.com/) · [Run locally](#run-locally) · [Acceptance demonstration](docs/interview-runbook.md) · [Code guide](docs/CODE_GUIDE.md)

[![CI](https://github.com/SinaDevCool/iwb-bess-day-ahead-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/SinaDevCool/iwb-bess-day-ahead-workbench/actions/workflows/ci.yml)

**Simulation only:** no live exchange submission or physical battery control. Example prices are illustrative; no forecast-provider credentials are required to try the demo.

## What the prototype demonstrates

One editable case has two views: **Auction Orders** and **Dispatch & Economics**.

| Capability | Implementation |
| --- | --- |
| Forecast entry | Complete CSV upload/paste, preview before application, and individual price editing |
| Market and Limit orders | BUY/SELL tickets with delivery interval, MW volume and optional price limit |
| Battery dispatch | Chronological simulation of power, stored energy and interval contribution |
| Physical validation | Aggregate power, storage bounds, grid limits, availability, cycle budget and final reserve |
| Inspectable results | Synchronized charts, interval/order evidence, saved history and outdated-result indicators |
| Optional decision support | MILP suggestions and portfolio repairs, reviewed before changing the draft |

The frontend uses **React, Next.js and TypeScript**; the API and calculation services use **Python/FastAPI**. This is not a Vue implementation.

## Try the workflow

1. Select a delivery day and product duration; review the battery configuration.
2. **Replace forecast**: upload or paste a complete forecast, review it, then apply. Alternatively, explicitly select example data.
3. **Add order**: enter Market or Limit BUY/SELL orders.
4. **Simulate battery dispatch**: inspect forecast, signed power, stored energy and contribution.
5. Open **Interval Detail**, inspect an outcome, edit an order and simulate again.

The charts share a timeline. Hover or arrow keys inspect intervals; Enter opens interval details. Saved results retain their original inputs: changing the current case marks previous results out of date.

### Simulation is not optimization

| Action | Effect |
| --- | --- |
| Simulate battery dispatch | Evaluates entered orders without changing their quantities |
| Re-optimize | Calculates optional suggestions or a repair preview |
| Apply / Add selected orders | Changes the draft after review; does not submit trades |
| Undo / Restore | Recovers inputs; does not execute orders |

Repair prioritizes preserving manual orders, fewer changes, less revised energy and then economics. Protected orders cannot be revised without permission. Allowing balancing additions permits new orders but does not require them. One repair plan may contain several corrections; the interface does not offer multiple alternative plans.

## Run locally

Run commands from the repository root—the directory containing this README and `Dockerfile`.

### Option A: Docker

Requires Docker with Linux-container support. The image includes the frontend, API and solver.

```sh
docker build -t iwb-workbench .
docker run --rm -p 10000:10000 iwb-workbench
```

Open [the workbench](http://localhost:10000/) or [API documentation](http://localhost:10000/docs). Without a persistent volume, history is removed with the container. Stop with Ctrl+C.

### Option B: development servers

Use **Python 3.12** and **Node.js 22**, matching CI and Docker. These PowerShell commands use an isolated Python environment; activation is not required.

**Terminal 1 — backend**

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8100
```

**Terminal 2 — frontend**

```powershell
cd frontend
npm ci
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8100"
npm run dev
```

On macOS/Linux, use `.venv/bin/python` and `export NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8100` instead. The same API URL is provided in [frontend/.env.example](frontend/.env.example).

Open [localhost:3100](http://localhost:3100/) and [backend API docs](http://127.0.0.1:8100/docs). Keep both terminals running. Development CORS allows frontend port 3100; changing that port requires a matching backend configuration.

`npm run build` produces a **static export** in `frontend/out`. Do not use `next start`; the Docker image serves the export through FastAPI. Render uses the same image and its assigned `PORT`. Health is available at `/health`.

## Forecast data

Use CSV columns `delivery_start,price_eur_mwh`, decimal-point prices and timestamps with a UTC offset (`Z` is UTC). In Excel, choose **CSV UTF-8** when saving. Pasting directly requires no encoding selection.

Every interval of the selected local delivery day must appear once, in chronological order—normally 24 hourly or 96 quarter-hourly rows. Daylight-saving transitions change those counts. Zero and negative prices are valid; blank prices are not zero. Maximum upload size is 256 KB.

Download a matching template in the app or use the complete [9 September 2026 hourly fixture](tests/fixtures/da-forecast-2026-09-09.csv). Invalid imports leave the current forecast unchanged.

Changing 60-minute data to 15 minutes preserves its profile and energy; it does not generate new price information or re-optimize orders. Incompatible quarter-hour profiles cannot silently merge.

## Model and boundaries

The configurable baseline is **100 MWh nominal capacity / 50 MW power**. The default 10–90 MWh operating range provides **80 MWh within that envelope**, with 50 MWh initial energy and a 50 MWh minimum final reserve.

- Grid energy = MW × interval hours. Symmetric charging/discharging efficiency is the square root of round-trip efficiency.
- Contribution = sales − purchases − battery-side wear − configured grid-side transaction costs. It is not comprehensive trading profit.
- The forecast is the assumed clearing and settlement price. BUY limits qualify at or below the limit; SELL limits qualify at or above it.
- Eligible same-side orders are checked together. Physically infeasible batches are excluded, not clipped; qualifying opposing BUY/SELL trades are not netted.
- Full allocation is assumed, including at-limit orders. Actual auction clearing, partial allocation and price impact are not modelled.

**Price rejection and physical exclusion are different outcomes.** A feasible remaining schedule after exclusions does not mean the entire entered portfolio was feasible. Its contribution is labelled accordingly.

The 15-minute choice is labelled simulation. Market presets are modelling assumptions, not exchange certification. Commercial forecast services, production authentication/access controls and live integrations are outside this prototype. SQLite demo history and browser drafts are not durable production records; Render’s ephemeral storage may be lost on restart or redeployment.

See [execution policies](docs/ORDER_SIMULATION_POLICIES.md) and [assumptions](docs/assumptions-and-boundaries.md) for detailed rules, defaults and operational gaps.

## Architecture

```text
React / Next.js workbench
          │ HTTP
          ▼
       FastAPI
          ├── Forecast validation and delivery grid
          ├── Order simulation ── shared battery economics
          ├── MILP suggestions / repair ── preview validation
          └── SQLite results and audit events
```

One shared draft drives the UI. Saved snapshots are separate from current inputs. Calculation services own physics and economics; charts present their results rather than implementing another calculator. SciPy/HiGHS supplies the mixed-integer solver.

| Directory | Purpose |
| --- | --- |
| `frontend/src/components/workspace/` | Current workbench, editors and workflow state |
| `backend/api/` | HTTP routing |
| `backend/domain/`, `backend/services/`, `backend/optimization/`, `backend/validation/` | Models, calculations, solver and checks |
| `tests/` | Backend regressions and shared fixtures |
| `docs/` | Runbook, policies and implementation guides |
| `archive/` | Historical optional UI, outside the active frontend build |

Legacy proposal/analysis services remain for compatibility; archived screens are not current features. The [code guide](docs/CODE_GUIDE.md) explains module ownership.

## Verification

CI checks formatting, lint, types, tests, source structure, the frontend export and Docker build. Coverage includes price boundaries, physical constraints, CSV validation, DST, financial reconciliation, repair permissions and stale-result protection.

From the repository root, after installing development dependencies:

```powershell
.\.venv\Scripts\python.exe -m pytest tests
.\.venv\Scripts\python.exe -m ruff check backend tests
.\.venv\Scripts\python.exe -m ruff format --check backend tests
cd frontend
npm run format:check
npm run check:structure
npm run typecheck
npm run lint
npm test
npm run build
```

The [acceptance demonstration](docs/interview-runbook.md) uses a fixed forecast and three orders to reproduce price rejection, correction, physical exclusion and restoration. It records automated and browser verification, including expected numerical results.

## Further reading

- [Interview runbook](docs/interview-runbook.md) — walkthrough and expected results.
- [Code guide](docs/CODE_GUIDE.md) — entry points, ownership and calculation conventions.
- [Execution policies](docs/ORDER_SIMULATION_POLICIES.md) — allocation and outcome semantics.
- [Assumptions and boundaries](docs/assumptions-and-boundaries.md) — defaults and production gaps.
- [Suggestions](docs/additional-order-suggestions.md), [re-optimization](docs/suggestion-reoptimization.md), [repair](docs/portfolio-repair.md) — optional workflows.

Historical UI audits describe their recorded release, not necessarily the current interface.
