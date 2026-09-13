"""configuration HTTP endpoints; request/response paths remain stable."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from backend.config.defaults import DEFAULT_BATTERY, DEFAULT_MARKET
from backend.domain.models import MarketConfig, SimulationRequest
from backend.services.forecast_import_service import MAX_UPLOAD_BYTES, forecast_hash, import_csv
from backend.services.forecast_service import build_demo_forecast

router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "service": "iwb-bess-day-ahead-workbench",
        "api_version": "3.0.0",
        "optimizer_version": "scipy_highs_milp_v1",
        "order_simulation_version": "market_limit_v1",
        "validation_version": "physical_and_order_validation_v4",
        "submission_mode": "preview_only",
    }


@router.get("/api/configuration")
def configuration():
    return {
        "battery": DEFAULT_BATTERY,
        "market": DEFAULT_MARKET,
        "warning": "Market parameters are interview assumptions and require IWB confirmation.",
        "assumption_sources": {
            "battery.capacity_mwh": {"status": "task_baseline", "label": "IWB task input"},
            "battery.max_charge_power_mw": {
                "status": "task_baseline",
                "label": "Derived from two-hour duration",
            },
            "battery.max_discharge_power_mw": {
                "status": "task_baseline",
                "label": "Derived from two-hour duration",
            },
            "market.exchange_fee_eur_per_mwh": {
                "status": "confirmation_required",
                "label": "IWB contract value not supplied",
            },
            "market.clearing_fee_eur_per_mwh": {
                "status": "public_tariff",
                "label": "ECC public tariff assumption",
            },
            "forecast": {"status": "illustrative", "label": "Illustrative deterministic profile"},
        },
    }


@router.get("/api/forecast")
def forecast(delivery_date: str = "2026-09-09", product_minutes: int = Query(60, ge=15, le=60)):
    try:
        if product_minutes not in (15, 60):
            raise ValueError("Product duration must be 15 or 60 minutes")
        market = MarketConfig.model_validate(
            {**DEFAULT_MARKET.model_dump(), "product_minutes": product_minutes}
        )
        return {
            "delivery_date": delivery_date,
            "timezone": market.timezone,
            "points": build_demo_forecast(delivery_date, market),
        }
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/api/forecast/import")
async def import_forecast(request: Request, delivery_date: str, product_minutes: int = 60):
    """Raw CSV upload avoids multipart dependencies; preview never changes saved runs."""
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "CSV must be smaller than 256 KB")
    try:
        market = MarketConfig.model_validate(
            {**DEFAULT_MARKET.model_dump(), "product_minutes": product_minutes}
        )
        return import_csv(bytes(raw), delivery_date, market)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/api/forecast/providers")
def forecast_providers():
    return {
        "items": [
            {"id": "demo", "name": "Illustrative demo", "connected": True},
            {"id": "volue", "name": "Volue Insight", "connected": False},
            {"id": "montel", "name": "Montel EQ", "connected": False},
        ]
    }


@router.post("/api/forecast/validate")
def validate_forecast(request: SimulationRequest):
    """Manual edits use the same model validation as upload and simulation."""
    points = request.prices
    if points is None:
        raise HTTPException(422, "Provide timestamped prices")
    return {"points": points, "content_hash": forecast_hash(points)}
