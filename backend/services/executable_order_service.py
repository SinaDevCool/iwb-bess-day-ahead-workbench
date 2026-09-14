"""Quantize and reconstruct legacy optimizer proposals; not the portfolio-repair MILP."""

from __future__ import annotations

from backend.domain.economics import calculate_interval, effective_transaction_fee
from backend.domain.models import Order
from backend.services.order_service import build_orders
from backend.validation.validators import validate_order_proposal


def build_executable_orders(simulation_id, dispatch, market, battery):
    """Quantize and repair orders until their reconstructed schedule is feasible."""
    raw_volume = sum(
        abs(row.power_mw) * market.product_minutes / 60 for row in dispatch if row.action != "idle"
    )
    raw_contribution = round(sum(row.interval_pnl_eur for row in dispatch), 2)
    orders = build_orders(simulation_id, dispatch, market, battery)
    adjusted = sum(
        1
        for row in dispatch
        if row.action != "idle"
        and not any(
            o.delivery_start_utc == row.timestamp_utc
            and abs(o.volume_mw - abs(row.power_mw)) < 1e-7
            for o in orders
        )
    )
    repaired = 0
    validation, proposal = validate_order_proposal(orders, market, battery, dispatch)
    interval_by_start = {row.timestamp_utc: row.interval for row in dispatch}
    while validation.status == "failed" and repaired < 10000 and orders:
        codes = {finding.code for finding in validation.findings if finding.severity == "error"}
        boundary_finding = next(
            (
                finding
                for finding in validation.findings
                if finding.code in {"proposal_soc_below_min", "proposal_soc_above_max"}
            ),
            None,
        )
        if codes & {"proposal_soc_below_min", "proposal_terminal_soc"}:
            candidates = [o for o in orders if o.side == "SELL"]
        elif "proposal_soc_above_max" in codes:
            candidates = [o for o in orders if o.side == "BUY"]
        else:
            candidates = sorted(
                orders, key=lambda o: abs(o.expected_contribution_eur / max(o.energy_mwh, 1e-9))
            )
        if not candidates:
            break
        if boundary_finding and boundary_finding.interval is not None:
            # Repair the latest causal order at or before the first boundary
            # crossing. Changing a later order cannot repair an earlier SoC.
            causal = [
                o
                for o in candidates
                if interval_by_start[o.delivery_start_utc] <= boundary_finding.interval
            ]
            order = max(causal, key=lambda o: o.delivery_start_utc) if causal else candidates[-1]
        elif codes & {"proposal_terminal_soc"}:
            order = max(candidates, key=lambda o: o.delivery_start_utc)
        else:
            order = min(
                candidates, key=lambda o: abs(o.expected_contribution_eur / max(o.energy_mwh, 1e-9))
            )
        new_volume = round(order.volume_mw - market.volume_increment_mw, 6)
        if new_volume <= 0:
            orders.remove(order)
        else:
            _update_order(order, new_volume, market, battery)
        repaired += 1
        validation, proposal = validate_order_proposal(orders, market, battery, dispatch)
    if validation.status == "failed":
        raise ValueError(
            "Rounded auction orders could not be repaired into a physically feasible package"
        )
    final_volume = sum(o.energy_mwh for o in orders)
    evidence = {
        "method": "conservative floor to market increment, followed by physical reconstruction and repair",
        "volume_increment_mw": market.volume_increment_mw,
        "adjusted_order_count": adjusted,
        "repaired_order_count": repaired,
        "volume_reduction_mwh": round(raw_volume - final_volume, 4),
        "contribution_delta_eur": round(
            proposal["proposal_contribution_eur"] - raw_contribution, 2
        ),
        "validation_status": validation.status,
    }
    return orders, validation, proposal, evidence


def _update_order(order: Order, volume: float, market, battery):
    economics = calculate_interval(
        order.side,
        volume,
        market.product_minutes / 60,
        order.expected_price_eur_mwh,
        battery,
        effective_transaction_fee(market),
    )
    order.volume_mw = volume
    order.energy_mwh = round(economics.grid_energy_mwh, 4)
    order.sales_revenue_eur = round(economics.sales_revenue_eur, 2)
    order.purchase_cost_eur = round(economics.purchase_cost_eur, 2)
    order.degradation_cost_eur = round(economics.degradation_cost_eur, 2)
    order.transaction_fee_eur = round(economics.transaction_fee_eur, 2)
    order.expected_contribution_eur = round(
        order.sales_revenue_eur
        - order.purchase_cost_eur
        - order.degradation_cost_eur
        - order.transaction_fee_eur,
        2,
    )
