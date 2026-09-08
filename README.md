# IWB BESS Day-Ahead Workbench

Interview prototype for a 100 MWh / 50 MW battery participating in a configurable Day-Ahead auction. The product converts a price forecast and battery assumptions into a feasible dispatch, scenario comparison, explainable economics, and a validated preview-only order proposal.

The dispatch is solved as a mixed-integer linear program with SciPy/HiGHS. It explicitly enforces SoC balance and bounds, power/grid limits, unavailable periods, terminal SoC, cycle throughput, and mutually exclusive charging/discharging.

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
