from backend.domain.models import SimulationRequest
from backend.services.simulation_service import run_simulation


def test_charge_and_discharge_create_correct_sides():
    result = run_simulation(SimulationRequest())
    assert any(order.side == "BUY" for order in result.orders)
    assert any(order.side == "SELL" for order in result.orders)
    actions = {row.timestamp_utc: row.action for row in result.dispatch}
    for order in result.orders:
        assert order.side == ("BUY" if actions[order.delivery_start_utc] == "charge" else "SELL")


def test_order_duration_and_energy_conversion():
    result = run_simulation(SimulationRequest())
    for order in result.orders:
        assert (order.delivery_end_utc - order.delivery_start_utc).total_seconds() == 3600
        assert abs(order.energy_mwh - order.volume_mw) < 0.001


def test_order_ids_are_unique():
    result = run_simulation(SimulationRequest())
    ids = [order.order_id for order in result.orders]
    assert len(ids) == len(set(ids))

