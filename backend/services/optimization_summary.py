"""Reporting only: preserve cent-ledger totals and proposal/optimizer distinctions."""


def build_optimization_summary(
    request, dispatch, proposal, orders, order_generation, terminal_value
):
    """Do not reinterpret signed legacy summary fields while assembling evidence."""
    charge_grid = sum(row.grid_energy_mwh for row in dispatch if row.action == "charge")
    discharge_grid = sum(row.grid_energy_mwh for row in dispatch if row.action == "discharge")
    charge_cost = -sum(
        row.grid_energy_mwh * row.price_eur_mwh for row in dispatch if row.action == "charge"
    )
    sales_revenue = sum(
        row.grid_energy_mwh * row.price_eur_mwh for row in dispatch if row.action == "discharge"
    )
    throughput = sum(row.battery_energy_mwh for row in dispatch if row.action != "idle")
    degradation = throughput * request.battery.degradation_cost_eur_per_mwh
    transaction_fees = sum(row.transaction_fee_eur for row in dispatch)
    # Reconcile the public daily total to the cent-rounded interval ledger.
    contribution = sum(row.interval_pnl_eur for row in dispatch)
    incremental_energy = max(
        proposal["proposal_terminal_soc_mwh"] - request.battery.target_soc_mwh, 0
    )
    terminal_energy_value = round(incremental_energy * terminal_value, 2)
    return {
        "expected_contribution_eur": proposal["proposal_contribution_eur"],
        "optimized_contribution_eur": round(contribution, 2),
        "baseline_proposal_contribution_eur": proposal["proposal_contribution_eur"],
        **{
            key: value
            for key, value in proposal.items()
            if key not in {"implied_soc_mwh", "implied_dispatch"}
        },
        "trader_adjustment_delta_eur": 0,
        "sales_revenue_eur": round(sales_revenue, 2),
        "purchase_cost_eur": round(charge_cost, 2),
        "degradation_cost_eur": round(degradation, 2),
        "transaction_fee_eur": round(transaction_fees, 2),
        "charged_grid_mwh": round(charge_grid, 3),
        "discharged_grid_mwh": round(discharge_grid, 3),
        "throughput_mwh": round(throughput, 3),
        "equivalent_cycles": round(throughput / (2 * request.battery.capacity_mwh), 3),
        "min_soc_mwh": min(
            (row.soc_mwh for row in dispatch), default=request.battery.initial_soc_mwh
        ),
        "max_soc_mwh": max(
            (row.soc_mwh for row in dispatch), default=request.battery.initial_soc_mwh
        ),
        "order_count": len(orders),
        "buy_volume_mwh": round(sum(o.energy_mwh for o in orders if o.side == "BUY"), 3),
        "sell_volume_mwh": round(sum(o.energy_mwh for o in orders if o.side == "SELL"), 3),
        "executable_rounding_delta_eur": order_generation["contribution_delta_eur"],
        "terminal_energy_value_eur": terminal_energy_value,
        "total_decision_value_eur": round(
            proposal["proposal_contribution_eur"] + terminal_energy_value, 2
        ),
    }
