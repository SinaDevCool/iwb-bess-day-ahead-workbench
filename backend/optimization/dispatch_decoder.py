"""Map a feasible solution to the cent-reconciled UI ledger, using canonical economics."""

from __future__ import annotations

from zoneinfo import ZoneInfo

from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import DispatchRow


def decode_dispatch(result, prices, battery, market):
    n = len(prices)
    dt = market.product_minutes / 60
    charge_offset, discharge_offset, soc_offset = 0, n, 2 * n
    transaction_fee = effective_transaction_fee(market)
    local_zone = ZoneInfo(market.timezone)
    dispatch: list[DispatchRow] = []
    cumulative = 0.0
    throughput = 0.0
    for t, point in enumerate(prices):
        charge = 0 if result.x[charge_offset + t] < 1e-7 else result.x[charge_offset + t]
        discharge = 0 if result.x[discharge_offset + t] < 1e-7 else result.x[discharge_offset + t]
        if charge > 0:
            action, power = "charge", -charge
            economics = calculate_interval(
                "BUY", charge, dt, point.price_eur_mwh, battery, transaction_fee
            )
        elif discharge > 0:
            action, power = "discharge", discharge
            economics = calculate_interval(
                "SELL", discharge, dt, point.price_eur_mwh, battery, transaction_fee
            )
        else:
            action, power = "idle", 0.0
            economics = None
        if economics is None:
            grid_energy = battery_energy = pnl = 0.0
            sales_revenue = purchase_cost = degradation_cost = transaction_cost = 0.0
        else:
            grid_energy = economics.grid_energy_mwh
            battery_energy = economics.battery_energy_mwh
            pnl = economics.contribution_eur
            sales_revenue = economics.sales_revenue_eur
            purchase_cost = economics.purchase_cost_eur
            degradation_cost = economics.degradation_cost_eur
            transaction_cost = economics.transaction_fee_eur
        # The UI and exported ledger operate at cent precision, so derive net
        # contribution from the same rounded components users can reconcile.
        sales_revenue = round(sales_revenue, 2)
        purchase_cost = round(purchase_cost, 2)
        degradation_cost = round(degradation_cost, 2)
        transaction_cost = round(transaction_cost, 2)
        pnl = round(sales_revenue - purchase_cost - degradation_cost - transaction_cost, 2)
        throughput += battery_energy
        cumulative += pnl
        dispatch.append(
            DispatchRow(
                interval=t,
                timestamp_utc=point.timestamp_utc,
                timestamp_local=point.timestamp_utc.astimezone(local_zone).isoformat(
                    timespec="minutes"
                ),
                price_eur_mwh=point.price_eur_mwh,
                action=action,
                power_mw=round(power, 6),
                grid_energy_mwh=round(grid_energy, 6),
                battery_energy_mwh=round(battery_energy, 6),
                soc_mwh=round(result.x[soc_offset + t + 1], 6),
                interval_pnl_eur=round(pnl, 2),
                cumulative_pnl_eur=round(cumulative, 2),
                sales_revenue_eur=round(sales_revenue, 2),
                purchase_cost_eur=round(purchase_cost, 2),
                degradation_cost_eur=round(degradation_cost, 2),
                transaction_fee_eur=round(transaction_cost, 2),
            )
        )
    return dispatch, throughput
