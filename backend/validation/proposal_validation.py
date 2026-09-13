from __future__ import annotations

from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import (
    BatteryConfig,
    DispatchRow,
    MarketConfig,
    Order,
    ValidationFinding,
)
from backend.validation.common import (
    _result,
)
from backend.validation.order_validation import validate_orders


from backend.validation.proposal_checks import (
    index_proposal_orders,
    check_soc_bounds,
    check_proposal_terminal,
)


def validate_order_proposal(
    orders: list[Order], market: MarketConfig, battery: BatteryConfig, dispatch: list[DispatchRow]
):
    """Validate an edited order package and reconstruct its implied physical schedule."""
    findings = list(validate_orders(orders, market).findings)
    dt = market.product_minutes / 60
    order_by_start = index_proposal_orders(orders, market, battery, dispatch, findings)
    soc = battery.initial_soc_mwh
    throughput = 0.0
    contribution = 0.0
    sales_revenue = 0.0
    purchase_cost = 0.0
    degradation_cost = 0.0
    transaction_cost = 0.0
    transaction_fee = effective_transaction_fee(market)
    implied_soc = []
    implied_dispatch = []
    cumulative = 0.0
    below_reported = False
    above_reported = False
    unavailable = set(battery.unavailable_intervals)
    for row in dispatch:
        order = order_by_start.get(row.timestamp_utc)
        if order:
            if row.interval in unavailable:
                findings.append(
                    ValidationFinding(
                        severity="error",
                        code="order_unavailable",
                        message=f"Order {order.order_id} is in an unavailable interval",
                        interval=row.interval,
                    )
                )
            economics = calculate_interval(
                order.side,
                order.volume_mw,
                dt,
                order.expected_price_eur_mwh,
                battery,
                transaction_fee,
            )
            soc += economics.soc_delta_mwh
            # Auction-order economics are presented to cents. Aggregate those
            # exact order values so the proposal reconciles with the CSV/UI.
            order_sales = round(economics.sales_revenue_eur, 2)
            order_purchase = round(economics.purchase_cost_eur, 2)
            order_degradation = round(economics.degradation_cost_eur, 2)
            order_transaction = round(economics.transaction_fee_eur, 2)
            order_contribution = round(
                order_sales - order_purchase - order_degradation - order_transaction, 2
            )
            sales_revenue += order_sales
            purchase_cost += order_purchase
            degradation_cost += order_degradation
            transaction_cost += order_transaction
            contribution += order_contribution
            throughput += economics.battery_energy_mwh
            action = "charge" if order.side == "BUY" else "discharge"
            power = -order.volume_mw if order.side == "BUY" else order.volume_mw
            interval_contribution = order_contribution
            grid_energy = economics.grid_energy_mwh
            battery_energy = economics.battery_energy_mwh
        else:
            action, power, interval_contribution = "idle", 0.0, 0.0
            grid_energy = battery_energy = 0.0
            order_sales = order_purchase = order_degradation = order_transaction = 0.0
        cumulative += interval_contribution
        implied_soc.append(round(soc, 6))
        implied_dispatch.append(
            DispatchRow(
                interval=row.interval,
                timestamp_utc=row.timestamp_utc,
                timestamp_local=row.timestamp_local,
                price_eur_mwh=row.price_eur_mwh,
                action=action,
                power_mw=power,
                grid_energy_mwh=grid_energy,
                battery_energy_mwh=battery_energy,
                soc_mwh=round(soc, 6),
                interval_pnl_eur=interval_contribution,
                cumulative_pnl_eur=round(cumulative, 2),
                sales_revenue_eur=order_sales,
                purchase_cost_eur=order_purchase,
                degradation_cost_eur=order_degradation,
                transaction_fee_eur=order_transaction,
            )
        )
        below_reported, above_reported = check_soc_bounds(
            soc, battery, row, findings, below_reported, above_reported
        )
    check_proposal_terminal(soc, throughput, battery, findings)
    return _result(findings), {
        "proposal_contribution_eur": round(contribution, 2),
        "proposal_terminal_soc_mwh": round(soc, 3),
        "proposal_throughput_mwh": round(throughput, 3),
        "proposal_equivalent_cycles": round(throughput / (2 * battery.capacity_mwh), 3),
        "proposal_min_soc_mwh": round(min(implied_soc, default=battery.initial_soc_mwh), 3),
        "proposal_max_soc_mwh": round(max(implied_soc, default=battery.initial_soc_mwh), 3),
        "proposal_sales_revenue_eur": round(sales_revenue, 2),
        "proposal_purchase_cost_eur": round(purchase_cost, 2),
        "proposal_degradation_cost_eur": round(degradation_cost, 2),
        "proposal_transaction_fee_eur": round(transaction_cost, 2),
        "proposal_buy_volume_mwh": round(
            sum(order.energy_mwh for order in orders if order.side == "BUY"), 3
        ),
        "proposal_sell_volume_mwh": round(
            sum(order.energy_mwh for order in orders if order.side == "SELL"), 3
        ),
        "implied_soc_mwh": implied_soc,
        "implied_dispatch": implied_dispatch,
    }
