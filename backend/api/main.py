from __future__ import annotations

import csv
import io
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from backend.config.defaults import DEFAULT_BATTERY, DEFAULT_MARKET
from backend.db.repository import add_audit_event, get_simulation, initialize, list_audit_events, list_simulations, save_simulation_with_event
from backend.domain.models import BatteryConfig, DispatchRow, MarketConfig, Order, OrderProposalEdit, SimulationDisplayNameUpdate, SimulationRequest, SimulationRunSummary
from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.services.forecast_service import build_demo_forecast
from backend.services.simulation_service import run_simulation
from backend.services.run_identity_service import legacy_run_display_name
from backend.validation.validators import validate_order_proposal


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    yield

app = FastAPI(title="IWB BESS Day-Ahead Workbench API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:3100", "http://localhost:3100"], allow_methods=["*"], allow_headers=["*"])


def _revalidate_payload(payload: dict):
    validation, proposal = validate_order_proposal(
        [Order.model_validate(order) for order in payload["orders"]],
        MarketConfig.model_validate(payload["market"]),
        BatteryConfig.model_validate(payload["battery"]),
        [DispatchRow.model_validate(row) for row in payload["dispatch"]],
    )
    payload["validation"] = validation.model_dump(mode="json")
    payload["proposal"] = proposal
    payload["summary"].update({key: value for key, value in proposal.items() if key not in {"implied_soc_mwh", "implied_dispatch"}})
    payload["summary"]["order_count"] = len(payload["orders"])
    payload["summary"]["buy_volume_mwh"] = proposal["proposal_buy_volume_mwh"]
    payload["summary"]["sell_volume_mwh"] = proposal["proposal_sell_volume_mwh"]
    payload["summary"]["throughput_mwh"] = proposal["proposal_throughput_mwh"]
    payload["summary"]["equivalent_cycles"] = proposal["proposal_equivalent_cycles"]
    payload["summary"]["min_soc_mwh"] = proposal["proposal_min_soc_mwh"]
    payload["summary"]["max_soc_mwh"] = proposal["proposal_max_soc_mwh"]
    payload["summary"]["expected_contribution_eur"] = proposal["proposal_contribution_eur"]
    if payload.get("horizon"):
        reserve = payload["horizon"]["reserve_soc_mwh"]
        value = payload["horizon"]["terminal_value_eur_per_mwh"]
        terminal_energy_value = round(max(proposal["proposal_terminal_soc_mwh"] - reserve, 0) * value, 2)
        payload["horizon"].update({
            "terminal_soc_mwh": proposal["proposal_terminal_soc_mwh"],
            "incremental_stored_energy_mwh": round(max(proposal["proposal_terminal_soc_mwh"] - reserve, 0), 3),
            "terminal_energy_value_eur": terminal_energy_value,
        })
        payload["summary"]["terminal_energy_value_eur"] = terminal_energy_value
        payload["summary"]["total_decision_value_eur"] = round(proposal["proposal_contribution_eur"] + terminal_energy_value, 2)
    baseline = payload["summary"].get("baseline_proposal_contribution_eur", payload["summary"].get("optimized_contribution_eur", proposal["proposal_contribution_eur"]))
    payload["summary"]["trader_adjustment_delta_eur"] = round(proposal["proposal_contribution_eur"] - baseline, 2)
    return validation, proposal


@app.get("/health")
def health():
    return {"status": "ok", "service": "iwb-bess-day-ahead-workbench", "api_version": "2.1.0", "optimizer_version": "scipy_highs_milp_v1", "validation_version": "physical_and_order_validation_v4", "submission_mode": "preview_only"}


@app.get("/api/configuration")
def configuration():
    return {"battery": DEFAULT_BATTERY, "market": DEFAULT_MARKET, "warning": "Market parameters are interview assumptions and require IWB confirmation.", "assumption_sources": {
        "battery.capacity_mwh": {"status": "task_baseline", "label": "IWB task input"},
        "battery.max_charge_power_mw": {"status": "task_baseline", "label": "Derived from two-hour duration"},
        "battery.max_discharge_power_mw": {"status": "task_baseline", "label": "Derived from two-hour duration"},
        "market.exchange_fee_eur_per_mwh": {"status": "confirmation_required", "label": "IWB contract value not supplied"},
        "market.clearing_fee_eur_per_mwh": {"status": "public_tariff", "label": "ECC public tariff assumption"},
        "forecast": {"status": "illustrative", "label": "Illustrative deterministic profile"},
    }}


@app.get("/api/forecast")
def forecast(delivery_date: str = "2026-09-09", product_minutes: Literal[15, 60] = 60):
    try:
        market = MarketConfig.model_validate({**DEFAULT_MARKET.model_dump(), "product_minutes": product_minutes})
        return {"delivery_date": delivery_date, "timezone": market.timezone, "points": build_demo_forecast(delivery_date, market)}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/simulations")
def simulate(request: SimulationRequest):
    try:
        return run_simulation(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/simulations")
def simulations():
    return {"items": list_simulations()}


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


@app.get("/api/simulation-runs")
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
    candidates = list_simulations(100)
    if delivery_date:
        candidates = [item for item in candidates if item.get("delivery_date") == delivery_date]
    if product_minutes:
        candidates = [item for item in candidates if item.get("market", {}).get("product_minutes") == product_minutes]
    if validation_status:
        candidates = [item for item in candidates if item.get("validation", {}).get("status") == validation_status]
    if scenario:
        needle = scenario.casefold()
        candidates = [item for item in candidates if needle in item.get("scenario_name", "").casefold()]
    return {"items": [_run_summary(item) for item in candidates[:limit]]}


@app.get("/api/simulations/{simulation_id}")
def simulation(simulation_id: str):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    payload["display_name"] = legacy_run_display_name(payload)
    return payload


@app.patch("/api/simulations/{simulation_id}/display-name")
def rename_simulation(simulation_id: str, update: SimulationDisplayNameUpdate):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    previous = legacy_run_display_name(payload)
    payload["display_name"] = update.display_name
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(payload, now, "SIMULATION_RENAMED", {"previous_name": previous, "display_name": update.display_name})
    return payload


@app.post("/api/order-proposals/{simulation_id}/validate")
def validate_proposal(simulation_id: str):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    validation, proposal = _revalidate_payload(payload)
    if validation.status == "passed" and payload.get("approval_status") is None:
        for order in payload["orders"]:
            order["status"] = "VALIDATED"
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(payload, now, "ORDER_PROPOSAL_VALIDATED", {"status": validation.status, "proposal_contribution_eur": proposal["proposal_contribution_eur"]})
    return payload


@app.patch("/api/order-proposals/{simulation_id}")
def edit_proposal(simulation_id: str, edit: OrderProposalEdit):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    by_id = {item.order_id: item for item in edit.adjustments}
    unknown = sorted(set(by_id) - {order["order_id"] for order in payload["orders"]})
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown order IDs: {', '.join(unknown)}")
    revised, changed = [], []
    for order in payload["orders"]:
        adjustment = by_id.get(order["order_id"])
        if not adjustment:
            revised.append(order); continue
        if adjustment.exclude:
            changed.append({"order_id": order["order_id"], "action": "excluded", "comment": adjustment.comment}); continue
        before = {"volume_mw": order["volume_mw"], "limit_price_eur_mwh": order["limit_price_eur_mwh"]}
        if (adjustment.volume_mw is None or abs(adjustment.volume_mw - order["volume_mw"]) < 1e-9) and (adjustment.limit_price_eur_mwh is None or abs(adjustment.limit_price_eur_mwh - order["limit_price_eur_mwh"]) < 1e-9):
            raise HTTPException(status_code=422, detail=f"Order {order['order_id']} has no effective change")
        if adjustment.volume_mw is not None:
            order["volume_mw"] = adjustment.volume_mw
            order["energy_mwh"] = round(adjustment.volume_mw * payload["market"]["product_minutes"] / 60, 6)
        if adjustment.limit_price_eur_mwh is not None:
            order["limit_price_eur_mwh"] = adjustment.limit_price_eur_mwh
        market = MarketConfig.model_validate(payload["market"])
        economics = calculate_interval(order["side"], order["volume_mw"], market.product_minutes / 60, order["expected_price_eur_mwh"], BatteryConfig.model_validate(payload["battery"]), effective_transaction_fee(market))
        order["sales_revenue_eur"] = round(economics.sales_revenue_eur, 2)
        order["purchase_cost_eur"] = round(economics.purchase_cost_eur, 2)
        order["degradation_cost_eur"] = round(economics.degradation_cost_eur, 2)
        order["transaction_fee_eur"] = round(economics.transaction_fee_eur, 2)
        order["expected_contribution_eur"] = round(order["sales_revenue_eur"] - order["purchase_cost_eur"] - order["degradation_cost_eur"] - order["transaction_fee_eur"], 2)
        order["status"] = "DRAFT"
        if adjustment.comment:
            order["explanation"] += f" Trader note: {adjustment.comment}"
        revised.append(order)
        changed.append({"order_id": order["order_id"], "action": "adjusted", "before": before, "after": {"volume_mw": order["volume_mw"], "limit_price_eur_mwh": order["limit_price_eur_mwh"]}, "comment": adjustment.comment})
    payload["orders"] = revised
    validation, proposal = _revalidate_payload(payload)
    payload["audit"]["modified_by_trader"] = True
    payload.pop("approval_status", None)
    payload["proposal_revision"] = int(payload.get("proposal_revision", 1)) + 1
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(payload, now, "ORDER_PROPOSAL_EDITED", {"changes": changed, "validation_status": validation.status, "proposal": proposal})
    return payload


@app.post("/api/order-proposals/{simulation_id}/approve")
def approve_proposal(simulation_id: str):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if payload["validation"]["status"] != "passed":
        raise HTTPException(status_code=409, detail="Only a fully passed proposal can be approved")
    if payload.get("approval_status") == "APPROVED_FOR_DEMO_EXPORT":
        return {"simulation_id": simulation_id, "approval_status": payload["approval_status"], "submitted": False, "already_approved": True}
    for order in payload["orders"]:
        order["status"] = "APPROVED"
    payload["approval_status"] = "APPROVED_FOR_DEMO_EXPORT"
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(payload, now, "ORDER_PROPOSAL_APPROVED", {"mode": "demo_only", "submitted": False})
    return {"simulation_id": simulation_id, "approval_status": payload["approval_status"], "submitted": False}


def _export_response(simulation_id: str, record_event: bool):
    payload = get_simulation(simulation_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if payload["validation"]["status"] != "passed":
        raise HTTPException(status_code=409, detail="Only a fully passed proposal can be exported")
    if payload.get("approval_status") != "APPROVED_FOR_DEMO_EXPORT":
        raise HTTPException(status_code=409, detail="Approve the current proposal before export")
    buffer = io.StringIO()
    columns = ["order_id", "delivery_start_utc", "delivery_end_utc", "side", "volume_mw", "energy_mwh", "limit_price_eur_mwh", "status"]
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    for order in payload["orders"]:
        writer.writerow({key: order.get(key) for key in columns})
    if record_event:
        add_audit_event(simulation_id, datetime.now(timezone.utc).isoformat(), "ORDER_PROPOSAL_EXPORTED", {"format": "csv"})
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={simulation_id}-orders.csv"})


@app.post("/api/order-proposals/{simulation_id}/exports")
def create_export(simulation_id: str):
    return _export_response(simulation_id, record_event=True)


@app.get("/api/order-proposals/{simulation_id}/export", deprecated=True)
def download_proposal_legacy(simulation_id: str):
    """Compatibility download; safe GET requests do not mutate the audit log."""
    return _export_response(simulation_id, record_event=False)


@app.get("/api/audit")
def audit():
    return {"items": list_audit_events()}


# In production the exported Next.js application is bundled into the image and
# served by FastAPI, keeping the interview prototype on a single Render service.
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend" / "out"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
