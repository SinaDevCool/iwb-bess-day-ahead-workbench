import pytest
from pydantic import ValidationError

from backend.domain.models import BatteryConfig


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
