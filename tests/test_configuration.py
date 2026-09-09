import pytest
from pydantic import ValidationError

from backend.domain.models import BatteryConfig, MarketConfig, OrderProposalEdit


@pytest.mark.parametrize(
    "changes",
    [
        {"capacity_mwh": 0},
        {"max_charge_power_mw": 0},
        {"max_discharge_power_mw": 0},
        {"grid_limit_mw": 0},
        {"min_soc_mwh": -1},
        {"max_soc_mwh": 101},
        {"min_soc_mwh": 90, "max_soc_mwh": 10},
        {"initial_soc_mwh": 95},
        {"target_soc_mwh": 95},
        {"round_trip_efficiency": 1.01},
        {"round_trip_efficiency": 0},
        {"degradation_cost_eur_per_mwh": -1},
        {"max_equivalent_cycles": 0},
    ],
)
def test_invalid_related_battery_configuration_is_rejected(changes):
    with pytest.raises(ValidationError):
        BatteryConfig(**changes)


def test_soc_limits_follow_editable_capacity():
    valid = BatteryConfig(
        capacity_mwh=200,
        min_soc_mwh=20,
        max_soc_mwh=180,
        initial_soc_mwh=100,
        target_soc_mwh=100,
    )
    assert valid.max_soc_mwh <= valid.capacity_mwh

    with pytest.raises(ValidationError):
        BatteryConfig(capacity_mwh=80, max_soc_mwh=90)


@pytest.mark.parametrize("changes", [
    {"min_price_eur_mwh": 100, "max_price_eur_mwh": 10},
    {"gate_closure_local": "noon"},
    {"timezone": "Mars/Olympus"},
    {"currency": "EU"},
    {"bidding_zone": ""},
])
def test_invalid_market_configuration_is_rejected(changes):
    with pytest.raises(ValidationError):
        MarketConfig(**changes)


def test_duplicate_or_contradictory_order_adjustments_are_rejected():
    with pytest.raises(ValidationError):
        OrderProposalEdit(adjustments=[
            {"order_id": "a", "volume_mw": 1, "comment": "first change"},
            {"order_id": "a", "volume_mw": 2, "comment": "second change"},
        ])


def test_scenario_probabilities_must_sum_to_one():
    from backend.domain.models import ScenarioProbability

    ScenarioProbability(downside=.2, expected=.6, upside=.2)
    with pytest.raises(ValidationError):
        ScenarioProbability(downside=.4, expected=.6, upside=.2)


def test_legacy_positive_exchange_fee_is_treated_as_configured():
    market = MarketConfig(exchange_fee_eur_per_mwh=.08)
    assert market.exchange_fee_policy == "configured"


def test_exchange_fee_can_be_explicitly_excluded():
    market = MarketConfig(exchange_fee_eur_per_mwh=.08, exchange_fee_policy="excluded")
    assert market.exchange_fee_policy == "excluded"
    with pytest.raises(ValidationError):
        OrderProposalEdit(adjustments=[
            {"order_id": "a", "exclude": True, "volume_mw": 1, "comment": "contradictory change"},
        ])
