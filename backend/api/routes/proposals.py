"""Thin proposal HTTP adapters; calculations and persistence live in the service."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.domain.models import OrderProposalEdit, SimulationRequest
from backend.services import proposal_service as service

router = APIRouter()


@router.post("/api/proposal-preview")
def proposal_preview(request: SimulationRequest):
    return service.proposal_preview(request)


@router.post("/api/order-proposals/{simulation_id}/validate")
def validate_proposal(simulation_id: str):
    return service.validate_proposal(simulation_id)


@router.patch("/api/order-proposals/{simulation_id}")
def edit_proposal(simulation_id: str, edit: OrderProposalEdit):
    return service.edit_proposal(simulation_id, edit)


@router.post("/api/order-proposals/{simulation_id}/approve")
def approve_proposal(simulation_id: str):
    return service.approve_proposal(simulation_id)


def _download(simulation_id: str, record_event: bool):
    content = service.export_proposal_csv(simulation_id, record_event)
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={simulation_id}-orders.csv"},
    )


@router.post("/api/order-proposals/{simulation_id}/exports")
def create_export(simulation_id: str):
    return _download(simulation_id, True)


@router.get("/api/order-proposals/{simulation_id}/export", deprecated=True)
def download_proposal_legacy(simulation_id: str):
    """Compatibility download: safe GET requests do not mutate the audit log."""
    return _download(simulation_id, False)
