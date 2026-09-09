from __future__ import annotations

from backend.config.defaults import DEFAULT_BATTERY, DEFAULT_MARKET
from backend.domain.models import SimulationRequest


def default_run_display_name(request: SimulationRequest) -> str:
    """Create a short decision-oriented label; immutable facts remain metadata."""
    battery = request.battery
    market = request.market

    if battery.unavailable_intervals:
        return "Availability restriction"
    if market.product_minutes != DEFAULT_MARKET.product_minutes:
        return f"{market.product_minutes}-minute products"
    if request.risk_posture == "downside_protected":
        return "Downside-protected policy"
    if request.risk_posture == "expected_value":
        return "Expected-value policy"
    if request.horizon_policy != "minimum_reserve":
        return {
            "terminal_value": "Terminal-value policy",
            "next_day_proxy": "Next-day value policy",
            "multi_day": "Multi-day value policy",
        }.get(request.horizon_policy, "Alternative energy policy")
    if battery.target_soc_mwh != DEFAULT_BATTERY.target_soc_mwh:
        direction = "Higher" if battery.target_soc_mwh > DEFAULT_BATTERY.target_soc_mwh else "Lower"
        return f"{direction} end-of-day reserve"
    if battery.grid_limit_mw != DEFAULT_BATTERY.grid_limit_mw:
        direction = "Expanded" if battery.grid_limit_mw > DEFAULT_BATTERY.grid_limit_mw else "Restricted"
        return f"{direction} grid connection"
    if battery.max_charge_power_mw != DEFAULT_BATTERY.max_charge_power_mw:
        direction = "Higher" if battery.max_charge_power_mw > DEFAULT_BATTERY.max_charge_power_mw else "Restricted"
        return f"{direction} charge power"
    if battery.max_discharge_power_mw != DEFAULT_BATTERY.max_discharge_power_mw:
        direction = "Higher" if battery.max_discharge_power_mw > DEFAULT_BATTERY.max_discharge_power_mw else "Restricted"
        return f"{direction} discharge power"
    if (battery.min_soc_mwh, battery.max_soc_mwh) != (DEFAULT_BATTERY.min_soc_mwh, DEFAULT_BATTERY.max_soc_mwh):
        baseline_width = DEFAULT_BATTERY.max_soc_mwh - DEFAULT_BATTERY.min_soc_mwh
        width = battery.max_soc_mwh - battery.min_soc_mwh
        return f"{'Wider' if width > baseline_width else 'Tighter'} SoC window"
    if battery.max_equivalent_cycles != DEFAULT_BATTERY.max_equivalent_cycles:
        direction = "Higher" if battery.max_equivalent_cycles > DEFAULT_BATTERY.max_equivalent_cycles else "Restricted"
        return f"{direction} cycle budget"
    if request.forecast.source_type != "illustrative":
        return "Manual price forecast"
    if request.scenario_name != "Expected forecast":
        return f"{request.scenario_name} forecast"
    return "Task baseline"


def legacy_run_display_name(payload: dict) -> str:
    return str(payload.get("display_name") or f"Saved run {str(payload.get('simulation_id', ''))[-8:]}")
