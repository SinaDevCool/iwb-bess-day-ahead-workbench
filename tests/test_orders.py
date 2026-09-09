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


def test_orders_include_cost_adjusted_break_even_evidence():
    result = run_simulation(SimulationRequest())
    for order in result.orders:
        assert order.pricing_posture == "balanced"
        if order.side == "BUY":
            assert order.margin_to_break_even_eur_mwh == round(
                order.break_even_price_eur_mwh - order.expected_price_eur_mwh, 2
            )
        else:
            assert order.margin_to_break_even_eur_mwh == round(
                order.expected_price_eur_mwh - order.break_even_price_eur_mwh, 2
            )


def test_initial_inventory_sale_uses_later_replenishment_opportunity():
    result = run_simulation(SimulationRequest(price_values=[60, 58, 55, 50, 40, 25, 10, 15, 35, 70, 95, 80, 65, 55, 35, 20, 30, 75, 130, 110, 85, 72, 65, 55]))
    first = next(order for order in result.orders if order.delivery_start_utc == result.dispatch[0].timestamp_utc)
    assert first.side == "SELL"
    assert first.break_even_price_eur_mwh < first.expected_price_eur_mwh
    assert first.margin_to_break_even_eur_mwh > 0
