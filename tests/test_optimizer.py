from backend.domain.models import SimulationRequest
from backend.services.simulation_service import run_simulation
from backend.domain.models import BatteryConfig, MarketConfig, PricePoint
from backend.optimization.milp_optimizer import optimize_dispatch
from datetime import datetime, timedelta, timezone


def test_iwb_case_is_feasible_and_profitable():
    result = run_simulation(SimulationRequest())
    assert result.validation.status == "passed"
    assert result.summary["expected_contribution_eur"] > 0
    assert result.optimization["constraint_status"] == "feasible"
    assert all(10 <= row.soc_mwh <= 90 for row in result.dispatch)
    assert all(abs(row.power_mw) <= 50.001 for row in result.dispatch)
    assert result.dispatch[-1].soc_mwh >= 50
    assert round(sum(row.interval_pnl_eur for row in result.dispatch), 2) == result.summary["optimized_contribution_eur"]
    for row in result.dispatch:
        assert round(row.sales_revenue_eur - row.purchase_cost_eur - row.degradation_cost_eur, 2) == row.interval_pnl_eur
    assert round(sum(order.expected_contribution_eur for order in result.orders), 2) == result.summary["expected_contribution_eur"]
    for order in result.orders:
        assert round(order.sales_revenue_eur - order.purchase_cost_eur - order.degradation_cost_eur, 2) == order.expected_contribution_eur


def test_flat_prices_do_not_create_unprofitable_cycles():
    request = SimulationRequest()
    points = request.model_copy().prices
    from backend.services.forecast_service import build_demo_forecast
    points = [p.model_copy(update={"price_eur_mwh": 50}) for p in build_demo_forecast(request.delivery_date, request.market)]
    result = run_simulation(request.model_copy(update={"prices": points}))
    assert result.summary["expected_contribution_eur"] == 0
    assert not result.orders


def test_unavailable_interval_is_idle():
    request = SimulationRequest()
    request.battery.unavailable_intervals = [6, 18]
    result = run_simulation(request)
    assert result.dispatch[6].action == "idle"
    assert result.dispatch[18].action == "idle"


def test_downside_scenario_compresses_expected_contribution():
    base = run_simulation(SimulationRequest())
    downside = run_simulation(SimulationRequest(
        scenario_name="Downside",
        strategy="conservative",
        peak_reduction_eur_mwh=15,
    ))
    assert downside.summary["expected_contribution_eur"] < base.summary["expected_contribution_eur"]


def test_milp_retains_value_when_throughput_constraint_binds():
    values = [50, 70, 10, 100, 130, 20, 0, 0]
    points = [PricePoint(timestamp_utc=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(hours=i), price_eur_mwh=value) for i, value in enumerate(values)]
    battery = BatteryConfig(capacity_mwh=20, max_charge_power_mw=10, max_discharge_power_mw=10, initial_soc_mwh=10, min_soc_mwh=0, max_soc_mwh=20, target_soc_mwh=10, round_trip_efficiency=.9, degradation_cost_eur_per_mwh=0, max_equivalent_cycles=.5, grid_limit_mw=10)
    _, metadata = optimize_dispatch(points, battery, MarketConfig(product_minutes=60))
    assert metadata["solver_status"] == "optimal"
    assert metadata["objective_value_eur"] > 1200
