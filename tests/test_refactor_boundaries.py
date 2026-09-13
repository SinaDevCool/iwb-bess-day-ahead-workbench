"""Characterize boundaries that must survive module decomposition."""

import math
from datetime import datetime, timezone

import pytest

from backend.config.defaults import DEFAULT_BATTERY, DEFAULT_MARKET
from backend.db import repository
from backend.domain.models import BatteryConfig, OrderSimulationRequest, SimulationRequest
from backend.domain.schemas.configuration import BatteryConfig as BatterySchema
from backend.optimization.milp_model import build_model
from backend.services.forecast_service import build_demo_forecast
from backend.services.order_simulation_engine import calculate_order_simulation


def test_compatibility_export_is_the_same_contract():
    assert BatteryConfig is BatterySchema


def test_calculation_is_deterministic_and_does_not_persist():
    request = OrderSimulationRequest()
    created = datetime(2026, 9, 9, tzinfo=timezone.utc)
    first = calculate_order_simulation(request, created=created, simulation_id="fixed")
    second = calculate_order_simulation(request, created=created, simulation_id="fixed")
    assert first.model_dump() == second.model_dump()
    assert not repository.DB_PATH.exists()


def test_milp_minimizes_cost_and_negative_sales():
    points = build_demo_forecast("2026-09-09", DEFAULT_MARKET)
    objective, integrality, bounds, constraints = build_model(
        points, DEFAULT_BATTERY, DEFAULT_MARKET, 55
    )
    n = len(points)
    dt = DEFAULT_MARKET.product_minutes / 60
    eta = math.sqrt(DEFAULT_BATTERY.round_trip_efficiency)
    fee = DEFAULT_MARKET.clearing_fee_eur_per_mwh
    wear = DEFAULT_BATTERY.degradation_cost_eur_per_mwh
    price = points[0].price_eur_mwh
    assert objective[0] == pytest.approx(dt * (price + fee + wear * eta))
    assert objective[n] == pytest.approx(dt * (-price + fee + wear / eta))
    assert objective[3 * n] == -55
    assert sum(integrality) == n
    assert bounds.lb[2 * n] == DEFAULT_BATTERY.initial_soc_mwh
    assert constraints.A.shape == (3 * n + 1, 4 * n + 1)


@pytest.mark.parametrize("request_type", [SimulationRequest, OrderSimulationRequest])
@pytest.mark.parametrize("date,count", [("2026-03-29", 23), ("2026-10-25", 25)])
def test_both_requests_share_dst_validation(request_type, date, count):
    request_type(delivery_date=date, price_values=[50] * count)
    with pytest.raises(ValueError, match="exactly"):
        request_type(delivery_date=date, price_values=[50] * 24)


def test_filtered_history_honours_offset():
    for i in range(4):
        repository.save_simulation(
            {
                "simulation_id": str(i),
                "created_at_utc": f"2026-09-09T0{i}:00:00Z",
                "run_type": "ORDER_SIMULATION",
            }
        )
    assert [x["simulation_id"] for x in repository.list_simulations(2, "ORDER_SIMULATION", 1)] == [
        "2",
        "1",
    ]
