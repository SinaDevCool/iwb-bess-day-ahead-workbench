"""Explicit, read-only portfolio repair permissions and complete candidate snapshots."""

from typing import Literal
from pydantic import BaseModel, Field, model_validator
from backend.domain.schemas.requests import OrderSimulationRequest
from backend.domain.schemas.orders import SubmittedOrder
from backend.domain.schemas.order_suggestions import SelectionIssue


class RepairRequest(BaseModel):
    baseline: OrderSimulationRequest
    allow_revision_ids: list[str] = Field(default_factory=list)
    keep_original_ids: list[str] = Field(default_factory=list)
    allow_additions: bool = True

    @model_validator(mode="after")
    def check_ids(self):
        ids = {o.client_order_id for o in self.baseline.orders}
        for values in (self.allow_revision_ids, self.keep_original_ids):
            if len(values) != len(set(values)) or not set(values) <= ids:
                raise ValueError("Repair permissions must refer to unique existing order IDs")
        return self


class RepairCheck(RepairRequest):
    input_hash: str
    proposed_orders: list[SubmittedOrder]


class RepairIssue(SelectionIssue):
    category: Literal["schedule", "technical"] = "schedule"
    action: Literal["repair", "review_calculation"] = "repair"
    side: Literal["BUY", "SELL"] | None = None
    # Individually proven blockers, not every order implicated in a group finding.
    required_revision_ids: list[str] = Field(default_factory=list)


class RepairResult(BaseModel):
    input_hash: str
    status: Literal["ready", "unchanged", "blocked", "timeout", "error"]
    message: str
    orders: list[SubmittedOrder] = Field(default_factory=list)
    issues: list[RepairIssue] = Field(default_factory=list)
    contribution_eur: float | None = None
    optimal: bool = False


def can_revise(request, order):
    """Keep-original wins; otherwise explicit consent or an unlocked suggestion permits edits.

    Manual/protected orders require consent. Permission never requires a change.
    """
    oid = order.client_order_id
    return oid not in request.keep_original_ids and (
        oid in request.allow_revision_ids or (order.origin == "suggested" and not order.protected)
    )
