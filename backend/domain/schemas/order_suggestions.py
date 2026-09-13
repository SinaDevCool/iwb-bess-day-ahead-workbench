"""Suggestion previews reuse submitted-order contracts, not legacy proposal orders."""

from pydantic import BaseModel, Field
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.orders import SubmittedOrder


class SuggestionSelection(BaseModel):
    baseline: OrderSimulationRequest
    input_hash: str
    selected_orders: list[SubmittedOrder] = Field(default_factory=list, max_length=500)


class SelectionResult(BaseModel):
    feasible: bool
    contribution_eur: float
    improvement_eur: float | None
    issues: list[str]


class SuggestionResult(BaseModel):
    input_hash: str
    orders: list[SubmittedOrder]
    validation: SelectionResult
    engine: str = "scipy_highs_milp_fixed_orders_v1"
