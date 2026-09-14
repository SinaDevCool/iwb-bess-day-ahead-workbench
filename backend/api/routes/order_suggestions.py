"""Read-only calculation endpoints; acceptance changes the client's draft only."""

from fastapi import APIRouter, HTTPException
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.order_suggestions import (
    SuggestionSelection,
    SuggestionResult,
    SelectionResult,
)
from backend.services.order_suggestion_service import suggest_orders
from backend.services.order_suggestion_validation import validate_selection

from backend.domain.schemas.order_repair import RepairRequest, RepairCheck, RepairResult
from backend.services.order_repair_service import repair_orders, validate_repair

router = APIRouter()


@router.post("/api/order-suggestions/repair", response_model=RepairResult)
def repair(request: RepairRequest):
    try:
        return repair_orders(request)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("/api/order-suggestions/repair/validate", response_model=RepairResult)
def check_repair(request: RepairCheck):
    try:
        return validate_repair(request)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("/api/order-suggestions", response_model=SuggestionResult)
def suggest(request: OrderSimulationRequest):
    try:
        return suggest_orders(request)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("/api/order-suggestions/validate", response_model=SelectionResult)
def validate(request: SuggestionSelection):
    try:
        return validate_selection(request)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
