"""Orders contracts; field names remain API-compatible."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SubmittedOrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class OrderExecutionStatus(str, Enum):
    EXECUTED = "EXECUTED"
    NOT_EXECUTED = "NOT_EXECUTED"
    PHYSICALLY_INFEASIBLE = "PHYSICALLY_INFEASIBLE"


class SubmittedOrder(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    client_order_id: str = Field(..., min_length=1, max_length=80)
    delivery_start_utc: datetime
    side: Literal["BUY", "SELL"]
    order_type: SubmittedOrderType
    volume_mw: float = Field(..., gt=0)
    limit_price_eur_mwh: float | None = None

    @model_validator(mode="after")
    def validate_order_type(self):
        if self.order_type == SubmittedOrderType.LIMIT and self.limit_price_eur_mwh is None:
            raise ValueError("Limit orders require a limit price")
        if self.order_type == SubmittedOrderType.MARKET and self.limit_price_eur_mwh is not None:
            raise ValueError("Market orders must not contain a limit price")
        return self


class Order(BaseModel):
    order_id: str
    delivery_start_utc: datetime
    delivery_end_utc: datetime
    delivery_local: str
    product: str
    side: Literal["BUY", "SELL"]
    volume_mw: float
    energy_mwh: float
    limit_price_eur_mwh: float
    expected_price_eur_mwh: float
    break_even_price_eur_mwh: float = 0
    margin_to_break_even_eur_mwh: float = 0
    pricing_posture: Literal["execution", "balanced", "margin"] = "balanced"
    expected_contribution_eur: float
    sales_revenue_eur: float = 0
    purchase_cost_eur: float = 0
    degradation_cost_eur: float = 0
    transaction_fee_eur: float = 0
    confidence: Literal["medium", "high"]
    status: Literal["DRAFT", "VALIDATED", "APPROVED"] = "DRAFT"
    explanation: str


class OrderAdjustment(BaseModel):
    order_id: str
    volume_mw: float | None = Field(None, gt=0)
    limit_price_eur_mwh: float | None = None
    exclude: bool = False
    comment: str = Field(..., min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_change(self):
        if not self.exclude and self.volume_mw is None and self.limit_price_eur_mwh is None:
            raise ValueError("An adjustment must change volume, price, or exclude the order")
        return self


class OrderProposalEdit(BaseModel):
    adjustments: list[OrderAdjustment] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_unique_orders(self):
        ids = [item.order_id for item in self.adjustments]
        if len(ids) != len(set(ids)):
            raise ValueError("Each order may be adjusted only once per request")
        if any(
            item.exclude and (item.volume_mw is not None or item.limit_price_eur_mwh is not None)
            for item in self.adjustments
        ):
            raise ValueError("An excluded order cannot also change volume or price")
        return self


class SimulationDisplayNameUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=48)

    @model_validator(mode="after")
    def normalize_display_name(self):
        self.display_name = " ".join(self.display_name.split())
        if not self.display_name or any(ord(character) < 32 for character in self.display_name):
            raise ValueError("Run name must contain visible text only")
        return self
