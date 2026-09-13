"""Proposal revision, validation and approval; independent of the HTTP transport."""

from __future__ import annotations

import csv
import io
import math
from datetime import datetime, timezone

from backend.db.repository import add_audit_event, get_simulation, save_simulation_with_event
from backend.domain.models import (
    OrderProposalEdit,
    SimulationRequest,
)
from backend.services.simulation_service import run_simulation


from backend.services.proposal_revalidation import revalidate_payload

from backend.services.proposal_pricing import reprice_order


class ProposalError(Exception):
    """Expected proposal failure, mapped to an HTTP status by the API boundary."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def load_optimization_proposal(simulation_id: str) -> dict:
    """Load a proposal or raise; order-simulation records are a different contract."""
    payload = get_simulation(simulation_id)
    if payload is None:
        raise ProposalError(status_code=404, detail="Simulation not found")
    if payload.get("run_type") == "ORDER_SIMULATION":
        raise ProposalError(
            status_code=409,
            detail="This action requires an optimization proposal, not an order simulation",
        )
    return payload


def proposal_preview(request: SimulationRequest):
    """Reuse the optimizer; explicit adapter into editable Limit orders. Never applies a draft."""
    try:
        result = run_simulation(request.model_copy(update={"include_sensitivities": False}))
        drafts = []
        for order in result.orders:
            step = result.market.price_increment_eur_mwh
            raw = order.expected_price_eur_mwh / step
            limit = (
                math.ceil(raw - 1e-9) if order.side == "BUY" else math.floor(raw + 1e-9)
            ) * step
            limit = min(
                result.market.max_price_eur_mwh, max(result.market.min_price_eur_mwh, limit)
            )
            drafts.append(
                {
                    "client_order_id": order.order_id,
                    "delivery_start_utc": order.delivery_start_utc,
                    "side": order.side,
                    "order_type": "LIMIT",
                    "volume_mw": order.volume_mw,
                    "limit_price_eur_mwh": round(limit, 6),
                }
            )
        return {
            "proposal": result,
            "orders": drafts,
            "pricing_policy": "Limit at forecast, rounded outward by side to the configured tick. Simulation still evaluates physical feasibility.",
        }
    except ValueError as error:
        raise ProposalError(status_code=422, detail=str(error)) from error


def validate_proposal(simulation_id: str) -> dict:
    """Reconstruct, update validation and persist one atomic audit event."""
    payload = load_optimization_proposal(simulation_id)
    validation, proposal = revalidate_payload(payload)
    if validation.status == "passed" and payload.get("approval_status") is None:
        for order in payload["orders"]:
            order["status"] = "VALIDATED"
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(
        payload,
        now,
        "ORDER_PROPOSAL_VALIDATED",
        {
            "status": validation.status,
            "proposal_contribution_eur": proposal["proposal_contribution_eur"],
        },
    )
    return payload


def edit_proposal(simulation_id: str, edit: OrderProposalEdit) -> dict:
    """Apply explicit revisions; every edit invalidates approval before atomic persistence."""
    payload = load_optimization_proposal(simulation_id)
    by_id = {item.order_id: item for item in edit.adjustments}
    unknown = sorted(set(by_id) - {order["order_id"] for order in payload["orders"]})
    if unknown:
        raise ProposalError(status_code=422, detail=f"Unknown order IDs: {', '.join(unknown)}")
    revised, changed = [], []
    for order in payload["orders"]:
        adjustment = by_id.get(order["order_id"])
        if not adjustment:
            revised.append(order)
            continue
        if adjustment.exclude:
            changed.append(
                {"order_id": order["order_id"], "action": "excluded", "comment": adjustment.comment}
            )
            continue
        before = {
            "volume_mw": order["volume_mw"],
            "limit_price_eur_mwh": order["limit_price_eur_mwh"],
        }
        if (
            adjustment.volume_mw is None or abs(adjustment.volume_mw - order["volume_mw"]) < 1e-9
        ) and (
            adjustment.limit_price_eur_mwh is None
            or abs(adjustment.limit_price_eur_mwh - order["limit_price_eur_mwh"]) < 1e-9
        ):
            raise ProposalError(
                status_code=422, detail=f"Order {order['order_id']} has no effective change"
            )
        if adjustment.volume_mw is not None:
            order["volume_mw"] = adjustment.volume_mw
            order["energy_mwh"] = round(
                adjustment.volume_mw * payload["market"]["product_minutes"] / 60, 6
            )
        if adjustment.limit_price_eur_mwh is not None:
            order["limit_price_eur_mwh"] = adjustment.limit_price_eur_mwh
        reprice_order(order, payload)
        order["status"] = "DRAFT"
        if adjustment.comment:
            order["explanation"] += f" Trader note: {adjustment.comment}"
        revised.append(order)
        changed.append(
            {
                "order_id": order["order_id"],
                "action": "adjusted",
                "before": before,
                "after": {
                    "volume_mw": order["volume_mw"],
                    "limit_price_eur_mwh": order["limit_price_eur_mwh"],
                },
                "comment": adjustment.comment,
            }
        )
    payload["orders"] = revised
    validation, proposal = revalidate_payload(payload)
    payload["audit"]["modified_by_trader"] = True
    payload.pop("approval_status", None)
    payload["proposal_revision"] = int(payload.get("proposal_revision", 1)) + 1
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(
        payload,
        now,
        "ORDER_PROPOSAL_EDITED",
        {"changes": changed, "validation_status": validation.status, "proposal": proposal},
    )
    return payload


def approve_proposal(simulation_id: str) -> dict:
    """Approve a passed revision for demo export only; never submit to a market."""
    payload = load_optimization_proposal(simulation_id)
    if payload["validation"]["status"] != "passed":
        raise ProposalError(status_code=409, detail="Only a fully passed proposal can be approved")
    if payload.get("approval_status") == "APPROVED_FOR_DEMO_EXPORT":
        return {
            "simulation_id": simulation_id,
            "approval_status": payload["approval_status"],
            "submitted": False,
            "already_approved": True,
        }
    for order in payload["orders"]:
        order["status"] = "APPROVED"
    payload["approval_status"] = "APPROVED_FOR_DEMO_EXPORT"
    now = datetime.now(timezone.utc).isoformat()
    save_simulation_with_event(
        payload, now, "ORDER_PROPOSAL_APPROVED", {"mode": "demo_only", "submitted": False}
    )
    return {
        "simulation_id": simulation_id,
        "approval_status": payload["approval_status"],
        "submitted": False,
    }


def export_proposal_csv(simulation_id: str, record_event: bool) -> str:
    """Return CSV text only after approval; optionally record the export event."""
    payload = load_optimization_proposal(simulation_id)
    if payload["validation"]["status"] != "passed":
        raise ProposalError(status_code=409, detail="Only a fully passed proposal can be exported")
    if payload.get("approval_status") != "APPROVED_FOR_DEMO_EXPORT":
        raise ProposalError(status_code=409, detail="Approve the current proposal before export")
    buffer = io.StringIO()
    columns = [
        "order_id",
        "delivery_start_utc",
        "delivery_end_utc",
        "side",
        "volume_mw",
        "energy_mwh",
        "limit_price_eur_mwh",
        "status",
    ]
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    for order in payload["orders"]:
        writer.writerow({key: order.get(key) for key in columns})
    if record_event:
        add_audit_event(
            simulation_id,
            datetime.now(timezone.utc).isoformat(),
            "ORDER_PROPOSAL_EXPORTED",
            {"format": "csv"},
        )
    return buffer.getvalue()
