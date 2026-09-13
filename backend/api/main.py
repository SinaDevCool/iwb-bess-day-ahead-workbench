"""Application bootstrap. Resource routers own HTTP, services own workflows."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes import configuration, history, proposals, simulations, order_suggestions
from backend.db.repository import initialize
from backend.services.proposal_service import ProposalError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    yield


app = FastAPI(title="IWB BESS Day-Ahead Workbench API", version="3.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3100", "http://localhost:3100"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ProposalError)
async def proposal_error(_request: Request, error: ProposalError):
    return JSONResponse(status_code=error.status_code, content={"detail": error.detail})


for router in (
    configuration.router,
    simulations.router,
    history.router,
    proposals.router,
    order_suggestions.router,
):
    app.include_router(router)

# Static mount comes last so API routes take precedence over the SPA export.
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend" / "out"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
