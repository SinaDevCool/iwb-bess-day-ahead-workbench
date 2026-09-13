"""Dispatch contracts; field names remain API-compatible."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DispatchRow(BaseModel):
    interval: int
    timestamp_utc: datetime
    timestamp_local: str
    price_eur_mwh: float
    action: Literal["charge", "discharge", "idle"]
    power_mw: float
    grid_energy_mwh: float
    battery_energy_mwh: float
    soc_mwh: float
    interval_pnl_eur: float
    cumulative_pnl_eur: float
    sales_revenue_eur: float = 0
    purchase_cost_eur: float = 0
    degradation_cost_eur: float = 0
    transaction_fee_eur: float = 0


class ValidationFinding(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    interval: int | None = None
    observed_value: float | None = None
    configured_limit: float | None = None
    difference: float | None = None
    tolerance: float | None = None
    unit: str | None = None
    source: str | None = None


class ValidationResult(BaseModel):
    status: Literal["passed", "warning", "failed"]
    findings: list[ValidationFinding]
