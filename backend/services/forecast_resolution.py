"""Resolve an already validated delivery grid; no market prediction is performed here."""

from backend.domain.models import OrderSimulationRequest, SimulationRequest, PricePoint
from backend.services.forecast_service import build_demo_forecast


def resolve_forecast(request: SimulationRequest | OrderSimulationRequest) -> list[PricePoint]:
    """Explicit points win over demo defaults; price_values replace values on that grid."""
    points = request.prices or build_demo_forecast(request.delivery_date, request.market)
    if request.price_values is not None:
        points = [
            point.model_copy(update={"price_eur_mwh": value})
            for point, value in zip(points, request.price_values)
        ]
    return points
