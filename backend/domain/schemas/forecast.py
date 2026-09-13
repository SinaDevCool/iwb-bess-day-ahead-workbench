"""Forecast contracts; field names remain API-compatible."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PricePoint(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    timestamp_utc: datetime
    price_eur_mwh: float
    low_eur_mwh: float | None = None
    high_eur_mwh: float | None = None


class ForecastMetadata(BaseModel):
    source_type: Literal["illustrative", "manual", "file"] = "illustrative"
    source_name: str = "IWB illustrative profile"
    version: str = "illustrative-v1"
    created_at_utc: datetime | None = None
    bidding_zone: str = "CH"
    content_hash: str | None = None
    issued_at_utc: datetime | None = None
    imported_at_utc: datetime | None = None
    # Browser-recorded application event, distinct from provider publication time.
    updated_at_utc: datetime | None = None
    adjusted_intervals: int = Field(0, ge=0)
    original_content_hash: str | None = None
    provider_id: str | None = None
    original_price_values: list[float] | None = Field(None, max_length=100)
