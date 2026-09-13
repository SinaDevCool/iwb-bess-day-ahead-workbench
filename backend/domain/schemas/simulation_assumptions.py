"""Versioned simulation policies, not claims about real auction allocation."""

from typing import Literal

from pydantic import BaseModel


class SimulationAssumptions(BaseModel):
    settlement: Literal["entered_forecast"] = "entered_forecast"
    allocation: Literal["full_if_eligible_and_feasible"] = "full_if_eligible_and_feasible"
    price_comparison: Literal["inclusive_exact"] = "inclusive_exact"
    auction_allocation_modelled: Literal[False] = False
    physical_rejection: Literal["exclude_batch_without_clipping"] = "exclude_batch_without_clipping"
    eligibility_order: Literal["price_before_physics"] = "price_before_physics"
