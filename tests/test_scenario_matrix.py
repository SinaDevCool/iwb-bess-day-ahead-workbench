"""Cross-configuration release matrix for executable Day-Ahead proposals."""

import pytest

from backend.domain.models import BatteryConfig, MarketConfig, SimulationRequest
from backend.services.simulation_service import run_simulation


CASES = [
    ("baseline", {}, {}, {}),
    ("quarter_hour", {}, {"product_minutes": 15}, {}),
    ("downside", {}, {}, {"scenario_name": "Downside", "peak_reduction_eur_mwh": 15}),
    ("peak_compression", {}, {}, {"scenario_name": "Peak compression", "peak_reduction_eur_mwh": 25}),
    ("upside", {}, {}, {"scenario_name": "Upside", "price_multiplier": 1.08}),
    ("small_battery", {"capacity_mwh": 50, "initial_soc_mwh": 25, "min_soc_mwh": 5, "max_soc_mwh": 45, "target_soc_mwh": 25}, {}, {}),
    ("large_battery", {"capacity_mwh": 200, "initial_soc_mwh": 100, "min_soc_mwh": 20, "max_soc_mwh": 180, "target_soc_mwh": 100}, {}, {}),
    ("tight_grid", {"grid_limit_mw": 10}, {}, {}),
    ("asymmetric_power", {"max_charge_power_mw": 20, "max_discharge_power_mw": 35}, {}, {}),
    ("low_efficiency", {"round_trip_efficiency": 0.64}, {}, {}),
    ("high_degradation", {"degradation_cost_eur_per_mwh": 40}, {}, {}),
    ("low_cycle_budget", {"max_equivalent_cycles": 0.25}, {}, {}),
    ("morning_outage", {"unavailable_intervals": [5, 6, 7]}, {}, {}),
    ("evening_outage", {"unavailable_intervals": [17, 18, 19]}, {}, {}),
    ("configured_fees", {}, {"exchange_fee_eur_per_mwh": 5, "exchange_fee_policy": "configured", "clearing_fee_eur_per_mwh": 1}, {}),
    ("terminal_value", {}, {}, {"horizon_policy": "terminal_value", "terminal_value_eur_per_mwh": 100}),
    ("expected_value", {}, {}, {"risk_posture": "expected_value"}),
    ("downside_protected", {}, {}, {"risk_posture": "downside_protected"}),
    ("shifted_soc", {"initial_soc_mwh": 20, "target_soc_mwh": 70}, {}, {}),
]


@pytest.mark.parametrize("name,battery_values,market_values,request_values", CASES, ids=[case[0] for case in CASES])
def test_completed_run_is_executable_and_reconciled(name, battery_values, market_values, request_values):
    request = SimulationRequest(
        battery=BatteryConfig(**battery_values),
        market=MarketConfig(**market_values),
        **request_values,
    )
    result = run_simulation(request)
    proposal = result.proposal
    duration_hours = result.market.product_minutes / 60

    assert result.validation.status == "passed", name
    assert len(result.dispatch) == 24 * 60 // result.market.product_minutes
    assert proposal.proposal_min_soc_mwh >= result.battery.min_soc_mwh
    assert proposal.proposal_max_soc_mwh <= result.battery.max_soc_mwh
    assert proposal.proposal_terminal_soc_mwh >= result.battery.target_soc_mwh
    assert proposal.proposal_equivalent_cycles <= result.battery.max_equivalent_cycles
    assert not any(
        row.action != "idle" and row.interval in result.battery.unavailable_intervals
        for row in proposal.implied_dispatch
    )
    assert all(
        abs(row.power_mw)
        <= min(
            result.battery.grid_limit_mw,
            result.battery.max_charge_power_mw if row.power_mw < 0 else result.battery.max_discharge_power_mw,
        ) + 1e-6
        for row in proposal.implied_dispatch
    )
    assert all(abs(order.energy_mwh - order.volume_mw * duration_hours) <= 1e-4 for order in result.orders)
    assert round(sum(order.expected_contribution_eur for order in result.orders), 2) == result.summary.expected_contribution_eur
    assert result.summary.order_count == len(result.orders)


def test_excluded_exchange_fee_stays_excluded_during_rounding_repair():
    market = MarketConfig(exchange_fee_eur_per_mwh=50, exchange_fee_policy="excluded")
    result = run_simulation(SimulationRequest(market=market))
    expected = sum(order.energy_mwh * market.clearing_fee_eur_per_mwh for order in result.orders)
    assert result.order_generation.repaired_order_count > 0
    assert abs(result.summary.proposal_transaction_fee_eur - expected) < 0.05

