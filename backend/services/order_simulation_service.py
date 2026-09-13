"""Assign run identity and persist one deterministic simulation plus its audit event."""

from datetime import datetime, timezone
from uuid import uuid4

from backend.db.repository import save_simulation_with_event
from backend.domain.models import OrderSimulationRequest, OrderSimulationResult
from backend.services.order_simulation_engine import calculate_order_simulation


def run_order_simulation(request: OrderSimulationRequest) -> OrderSimulationResult:
    created = datetime.now(timezone.utc)
    result = calculate_order_simulation(
        request, created=created, simulation_id=f"ord-{uuid4().hex[:10]}"
    )
    save_simulation_with_event(
        result.model_dump(mode="json"),
        created.isoformat(),
        "ORDER_SIMULATION_CREATED",
        {"run_type": result.run_type, "validation_status": result.validation.status},
    )
    return result
