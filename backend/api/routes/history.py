"""history HTTP endpoints; request/response paths remain stable."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from backend.db.repository import (
    get_simulation,
    list_audit_events,
    list_simulations,
    save_simulation_with_event,
)
from backend.domain.models import SimulationDisplayNameUpdate, SimulationRunSummary
from backend.services.proposal_service import load_optimization_proposal
from backend.services.run_identity_service import legacy_run_display_name

router = APIRouter()


@router.get("/api/workspace-history")
def workspace_history(offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
    return {
        "items": [
            {
                "simulation_id": p["simulation_id"],
                "display_name": legacy_run_display_name(p),
                "run_type": p.get("run_type", "OPTIMIZATION"),
                "created_at_utc": p["created_at_utc"],
                "delivery_date": p["delivery_date"],
                "validation_status": p["validation"]["status"],
                "contribution_eur": p["summary"].get(
                    "net_contribution_eur", p["summary"].get("expected_contribution_eur", 0)
                ),
                "source_proposal_id": p.get("audit", {}).get("source_proposal_id"),
            }
            for p in list_simulations(limit, offset=offset)
        ]
    }


@router.get("/api/workspace-history/{simulation_id}")
def history_detail(simulation_id: str):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(404, "Run not found")
    return {"run": payload, "events": list_audit_events(100, simulation_id)}


def _run_summary(payload: dict) -> SimulationRunSummary:
    created = datetime.fromisoformat(str(payload["created_at_utc"]).replace("Z", "+00:00"))
    scenario = payload.get("scenario_name", "Unnamed run")
    product_minutes = payload.get("market", {}).get("product_minutes", 60)
    return SimulationRunSummary(
        simulation_id=payload["simulation_id"],
        created_at_utc=created,
        display_name=legacy_run_display_name(payload),
        delivery_date=payload["delivery_date"],
        scenario_name=scenario,
        product_minutes=product_minutes,
        risk_posture=payload.get("risk_posture", "balanced"),
        horizon_policy=payload.get("horizon_policy", "minimum_reserve"),
        capacity_mwh=payload.get("battery", {}).get("capacity_mwh", 0),
        validation_status=payload.get("validation", {}).get("status", "unknown"),
        modified_by_trader=bool(payload.get("audit", {}).get("modified_by_trader", False)),
        expected_contribution_eur=payload.get("summary", {}).get("expected_contribution_eur", 0),
        downside_contribution_eur=payload.get("risk", {}).get("downside_contribution_eur"),
        upside_contribution_eur=payload.get("risk", {}).get("upside_contribution_eur"),
        throughput_mwh=payload.get("summary", {}).get("throughput_mwh", 0),
        equivalent_cycles=payload.get("summary", {}).get("equivalent_cycles", 0),
        order_count=payload.get("summary", {}).get("order_count", len(payload.get("orders", []))),
        input_hash=str(payload.get("audit", {}).get("input_hash", "not-recorded")),
    )


@router.get("/api/simulation-runs")
def simulation_runs(
    limit: int = Query(30, ge=1, le=100),
    delivery_date: str | None = None,
    product_minutes: int | None = Query(None, ge=15, le=60),
    validation_status: Literal["passed", "warning", "failed"] | None = None,
    scenario: str | None = None,
):
    """Return compact saved-run metadata without dispatch and order arrays."""
    if product_minutes is not None and product_minutes not in (15, 60):
        raise HTTPException(status_code=422, detail="product_minutes must be 15 or 60")
    candidates = list_simulations(100, run_type="OPTIMIZATION")
    if delivery_date:
        candidates = [item for item in candidates if item.get("delivery_date") == delivery_date]
    if product_minutes:
        candidates = [
            item
            for item in candidates
            if item.get("market", {}).get("product_minutes") == product_minutes
        ]
    if validation_status:
        candidates = [
            item
            for item in candidates
            if item.get("validation", {}).get("status") == validation_status
        ]
    if scenario:
        needle = scenario.casefold()
        candidates = [
            item for item in candidates if needle in item.get("scenario_name", "").casefold()
        ]
    return {"items": [_run_summary(item) for item in candidates[:limit]]}


@router.patch("/api/simulations/{simulation_id}/display-name")
def rename_simulation(simulation_id: str, update: SimulationDisplayNameUpdate):
    payload = load_optimization_proposal(simulation_id)
    previous = legacy_run_display_name(payload)
    payload["display_name"] = update.display_name
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(
        payload,
        now,
        "SIMULATION_RENAMED",
        {"previous_name": previous, "display_name": update.display_name},
    )
    return payload


@router.get("/api/audit")
def audit():
    return {"items": list_audit_events()}
