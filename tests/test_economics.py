from backend.domain.economics import calculate_interval
from backend.domain.models import BatteryConfig


def test_interval_economics_reconciles_for_buy_and_sell():
    battery = BatteryConfig()
    buy = calculate_interval("BUY", 50, 1, 40, battery)
    sell = calculate_interval("SELL", 50, 1, 100, battery)
    for result in (buy, sell):
        assert result.contribution_eur == result.sales_revenue_eur - result.purchase_cost_eur - result.degradation_cost_eur
        assert result.grid_energy_mwh == 50
        assert result.battery_energy_mwh > 0
    assert buy.soc_delta_mwh > 0
    assert sell.soc_delta_mwh < 0


def test_round_trip_losses_require_more_battery_energy_to_sell():
    battery = BatteryConfig(round_trip_efficiency=0.81)
    buy = calculate_interval("BUY", 10, 1, 0, battery)
    sell = calculate_interval("SELL", 10, 1, 0, battery)
    assert buy.battery_energy_mwh == 9
    assert round(sell.battery_energy_mwh, 6) == round(10 / 0.9, 6)
