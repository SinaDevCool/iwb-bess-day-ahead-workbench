"""simulations HTTP endpoints; request/response paths remain stable."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.db.repository import get_simulation, list_simulations
from backend.domain.models import OrderSimulationRequest, OrderSimulationResult, SimulationRequest
from backend.services.order_simulation_service import run_order_simulation
from backend.services.proposal_service import load_optimization_proposal
from backend.services.run_identity_service import legacy_run_display_name
from backend.services.simulation_service import run_simulation, sensitivities_for_snapshot

router = APIRouter()


@router.post("/api/simulations")
def simulate(request: SimulationRequest):
    try:
        return run_simulation(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/api/order-simulations", response_model=OrderSimulationResult)
def simulate_orders(request: OrderSimulationRequest):
    """Simulate entered Market/Limit orders against the entered DA forecast."""
    try:
        return run_order_simulation(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/api/order-simulations")
def order_simulations():
    return {"items": list_simulations(run_type="ORDER_SIMULATION")}


@router.post("/api/simulations/{simulation_id}/sensitivities")
def simulation_sensitivities(simulation_id: str):
    payload = load_optimization_proposal(simulation_id)
    try:
        return {"simulation_id": simulation_id, "items": sensitivities_for_snapshot(payload)}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/api/order-simulations/{simulation_id}", response_model=OrderSimulationResult)
def order_simulation(simulation_id: str):
    payload = get_simulation(simulation_id)
    if payload is None or payload.get("run_type") != "ORDER_SIMULATION":
        raise HTTPException(status_code=404, detail="Order simulation not found")
    return payload


@router.get("/api/simulations")
def simulations():
    return {"items": list_simulations(run_type="OPTIMIZATION")}


@router.get("/api/simulations/{simulation_id}")
def simulation(simulation_id: str):
    payload = load_optimization_proposal(simulation_id)
    payload["display_name"] = legacy_run_display_name(payload)
    return payload
