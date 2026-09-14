"""Suggestion previews reuse submitted-order contracts, not legacy proposal orders."""

from pydantic import BaseModel, Field
from datetime import datetime
from backend.domain.schemas.dispatch import ValidationFinding
from backend.domain.schemas.orders import OrderExecutionStatus
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.orders import SubmittedOrder


class SuggestionSelection(BaseModel):
    baseline: OrderSimulationRequest
    input_hash: str
    selected_orders: list[SubmittedOrder] = Field(default_factory=list, max_length=500)


class SelectionIssue(ValidationFinding):
    """Existing finding plus order identities; no second constraint calculation."""

    issue_id: str
    delivery_start_utc: datetime | None = None
    existing_orders: list[SubmittedOrder] = Field(default_factory=list)
    selected_order_ids: list[str] = Field(default_factory=list)


class SelectionOrderCheck(BaseModel):
    order_id: str
    execution_status: OrderExecutionStatus
    reason_code: str
    issue_ids: list[str] = Field(default_factory=list)
    after_exclusion: bool = False


class SelectionResult(BaseModel):
    feasible: bool
    contribution_eur: float
    improvement_eur: float | None
    issues: list[str]
    interval_issues: list[SelectionIssue] = Field(default_factory=list)
    order_checks: list[SelectionOrderCheck] = Field(default_factory=list)


class SuggestionResult(BaseModel):
    input_hash: str
    orders: list[SubmittedOrder]
    validation: SelectionResult
    engine: str = "scipy_highs_milp_fixed_orders_v1"
