"""Re-optimize controlled changes against an existing snapshot, without saving new runs."""

from __future__ import annotations


from typing import Callable, TypedDict, Any
from backend.domain.models import SimulationRequest, DispatchRow


class LeverRequired(TypedDict):
    key: str
    label: str
    unit: str
    baseline: float
    lower: float | None
    upper: float | None
    updates: Callable[[float], dict[str, Any]]
    interpretation: str


class LeverDefinition(LeverRequired, total=False):
    category: str
    scope: str


def operating_levers(
    request: SimulationRequest, baseline_dispatch: list[DispatchRow], terminal_value: float
) -> list[LeverDefinition]:
    """Bounds describe tested operating decisions, not changes to purchased hardware."""
    capacity = request.battery.capacity_mwh
    step_mwh = max(1.0, capacity * 0.10)
    power_baseline = min(
        request.battery.max_charge_power_mw,
        request.battery.max_discharge_power_mw,
        request.battery.grid_limit_mw,
    )
    soc_window = request.battery.max_soc_mwh - request.battery.min_soc_mwh
    active_intervals = [row.interval for row in baseline_dispatch if row.action != "idle"]
    outage_candidate = max(
        active_intervals,
        key=lambda index: abs(baseline_dispatch[index].interval_pnl_eur),
        default=None,
    )

    definitions: list[LeverDefinition] = [
        {
            "key": "terminal_reserve",
            "label": "End-of-day reserve",
            "unit": "MWh",
            "baseline": request.battery.target_soc_mwh,
            "lower": max(request.battery.min_soc_mwh, request.battery.target_soc_mwh - step_mwh),
            "upper": min(request.battery.max_soc_mwh, request.battery.target_soc_mwh + step_mwh),
            "updates": lambda value: {"target_soc_mwh": value},
            "interpretation": "Value of carrying more or less energy beyond the delivery day.",
        },
        {
            "key": "cycles",
            "label": "Daily cycle budget",
            "unit": "EFC",
            "baseline": request.battery.max_equivalent_cycles,
            "lower": max(0.25, request.battery.max_equivalent_cycles - 0.25),
            "upper": min(3.0, request.battery.max_equivalent_cycles + 0.25),
            "updates": lambda value: {"max_equivalent_cycles": value},
            "interpretation": "Value of tightening or relaxing today's approved throughput budget.",
        },
        {
            "key": "operating_power",
            "label": "Operating power cap",
            "unit": "MW",
            "baseline": power_baseline,
            "lower": round(power_baseline * 0.90, 3),
            "upper": None,
            "updates": lambda value: {
                "max_charge_power_mw": min(request.battery.max_charge_power_mw, value),
                "max_discharge_power_mw": min(request.battery.max_discharge_power_mw, value),
                "grid_limit_mw": min(request.battery.grid_limit_mw, value),
            },
            "interpretation": "Cost of a temporary symmetric operating-power derating.",
        },
        {
            "key": "soc_window",
            "label": "Operating SoC window",
            "unit": "MWh",
            "baseline": soc_window,
            "lower": max(1.0, soc_window - step_mwh),
            "upper": None,
            "updates": lambda value: tighten_soc_window(value, request, soc_window),
            "interpretation": "Cost of tightening the approved operating SoC envelope.",
        },
        {
            "key": "availability",
            "label": "Asset availability",
            "unit": "unavailable intervals",
            "baseline": float(len(request.battery.unavailable_intervals)),
            "lower": 0.0 if request.battery.unavailable_intervals else None,
            "upper": float(len(request.battery.unavailable_intervals) + 1)
            if outage_candidate is not None
            else None,
            "updates": lambda value: {
                "unavailable_intervals": []
                if value == 0
                else sorted(
                    set(
                        [
                            *request.battery.unavailable_intervals,
                            *([] if outage_candidate is None else [outage_candidate]),
                        ]
                    )
                ),
            },
            "interpretation": "Value gained from restoring availability or lost through one material outage interval.",
        },
        {
            "key": "terminal_value",
            "label": "Terminal energy value",
            "unit": "€/MWh",
            "category": "strategy",
            "scope": "request",
            "baseline": terminal_value,
            "lower": max(0.0, terminal_value - 10.0),
            "upper": terminal_value + 10.0,
            "updates": lambda value: {
                "horizon_policy": "terminal_value",
                "terminal_value_eur_per_mwh": value,
            },
            "interpretation": "How the assumed value of stored energy beyond the auction day changes today's schedule.",
        },
        {
            "key": "downside_weight",
            "label": "Downside scenario weight",
            "unit": "%",
            "category": "strategy",
            "scope": "request",
            "baseline": request.scenario_probabilities.downside * 100,
            "lower": max(0.0, request.scenario_probabilities.downside * 100 - 10.0),
            "upper": min(90.0, request.scenario_probabilities.downside * 100 + 10.0),
            "updates": lambda value: change_downside_weight(value, request),
            "interpretation": "How a more or less downside-focused probability view changes the preferred schedule.",
        },
    ]

    return definitions


def tighten_soc_window(value, request, soc_window):
    """Preserve the approved multi-field sensitivity policy; not a hardware modification."""
    return {
        "min_soc_mwh": request.battery.min_soc_mwh + (soc_window - value) / 2,
        "max_soc_mwh": request.battery.max_soc_mwh - (soc_window - value) / 2,
        "initial_soc_mwh": min(
            request.battery.max_soc_mwh - (soc_window - value) / 2,
            max(
                request.battery.min_soc_mwh + (soc_window - value) / 2,
                request.battery.initial_soc_mwh,
            ),
        ),
        "target_soc_mwh": min(
            request.battery.max_soc_mwh - (soc_window - value) / 2,
            max(
                request.battery.min_soc_mwh + (soc_window - value) / 2,
                request.battery.target_soc_mwh,
            ),
        ),
    }


def change_downside_weight(value, request):
    """Preserve the approved multi-field sensitivity policy; not a hardware modification."""
    return {
        "scenario_probabilities": request.scenario_probabilities.model_copy(
            update={
                "downside": value / 100,
                "expected": request.scenario_probabilities.expected
                + request.scenario_probabilities.downside
                - value / 100,
            }
        )
    }
