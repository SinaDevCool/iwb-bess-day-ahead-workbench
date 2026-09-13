"""Proposal revision, validation and approval; independent of the HTTP transport."""

from __future__ import annotations


from backend.domain.models import (
    BatteryConfig,
    DispatchRow,
    MarketConfig,
    Order,
)
from backend.validation.validators import validate_order_proposal


def revalidate_payload(payload: dict):
    """Update derived fields together after reconstructing the entire edited proposal."""
    validation, proposal = validate_order_proposal(
        [Order.model_validate(order) for order in payload["orders"]],
        MarketConfig.model_validate(payload["market"]),
        BatteryConfig.model_validate(payload["battery"]),
        [DispatchRow.model_validate(row) for row in payload["dispatch"]],
    )
    payload["validation"] = validation.model_dump(mode="json")
    payload["proposal"] = proposal
    payload["summary"].update(
        {
            key: value
            for key, value in proposal.items()
            if key not in {"implied_soc_mwh", "implied_dispatch"}
        }
    )
    payload["summary"]["order_count"] = len(payload["orders"])
    payload["summary"]["buy_volume_mwh"] = proposal["proposal_buy_volume_mwh"]
    payload["summary"]["sell_volume_mwh"] = proposal["proposal_sell_volume_mwh"]
    payload["summary"]["throughput_mwh"] = proposal["proposal_throughput_mwh"]
    payload["summary"]["equivalent_cycles"] = proposal["proposal_equivalent_cycles"]
    payload["summary"]["min_soc_mwh"] = proposal["proposal_min_soc_mwh"]
    payload["summary"]["max_soc_mwh"] = proposal["proposal_max_soc_mwh"]
    payload["summary"]["expected_contribution_eur"] = proposal["proposal_contribution_eur"]
    if payload.get("horizon"):
        reserve = payload["horizon"]["reserve_soc_mwh"]
        value = payload["horizon"]["terminal_value_eur_per_mwh"]
        terminal_energy_value = round(
            max(proposal["proposal_terminal_soc_mwh"] - reserve, 0) * value, 2
        )
        payload["horizon"].update(
            {
                "terminal_soc_mwh": proposal["proposal_terminal_soc_mwh"],
                "incremental_stored_energy_mwh": round(
                    max(proposal["proposal_terminal_soc_mwh"] - reserve, 0), 3
                ),
                "terminal_energy_value_eur": terminal_energy_value,
            }
        )
        payload["summary"]["terminal_energy_value_eur"] = terminal_energy_value
        payload["summary"]["total_decision_value_eur"] = round(
            proposal["proposal_contribution_eur"] + terminal_energy_value, 2
        )
    baseline = payload["summary"].get(
        "baseline_proposal_contribution_eur",
        payload["summary"].get("optimized_contribution_eur", proposal["proposal_contribution_eur"]),
    )
    payload["summary"]["trader_adjustment_delta_eur"] = round(
        proposal["proposal_contribution_eur"] - baseline, 2
    )
    return validation, proposal
