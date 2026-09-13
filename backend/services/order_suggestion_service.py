"""Optimize additions around fixed orders; never mutate or persist the baseline."""

import math
from uuid import uuid4
from backend.domain.schemas.orders import SubmittedOrder
from backend.domain.schemas.order_suggestions import SuggestionResult, SuggestionSelection
from backend.services.forecast_resolution import resolve_forecast
from backend.services.order_execution_rules import _clears
from backend.services.order_suggestion_validation import input_hash, validate_selection
from backend.optimization.milp_optimizer import optimize_dispatch


def suggest_orders(request):
    points = resolve_forecast(request)
    index = {point.timestamp_utc: t for t, point in enumerate(points)}
    charge, discharge = [0.0] * len(points), [0.0] * len(points)
    for order in request.orders:
        t = index[order.delivery_start_utc]
        if _clears(order, points[t].price_eur_mwh):
            target = charge if order.side == "BUY" else discharge
            target[t] += order.volume_mw
    for t in range(len(points)):
        if charge[t] and discharge[t]:
            raise ValueError(
                f"Conflicting eligible BUY and SELL orders in interval {t + 1}. Adjust those orders first."
            )
    dispatch, _ = optimize_dispatch(
        points, request.battery, request.market, fixed_power=(charge, discharge)
    )
    orders = []
    step = request.market.price_increment_eur_mwh
    lot = request.market.volume_increment_mw
    for t, row in enumerate(dispatch):
        side = "BUY" if row.power_mw < 0 else "SELL"
        fixed = charge[t] if side == "BUY" else discharge[t]
        volume = round(round((abs(row.power_mw) - fixed) / lot) * lot, 8)
        if volume <= 0:
            continue
        raw = points[t].price_eur_mwh / step
        limit = (math.ceil(raw - 1e-9) if side == "BUY" else math.floor(raw + 1e-9)) * step
        if not request.market.min_price_eur_mwh <= limit <= request.market.max_price_eur_mwh:
            raise ValueError("No eligible tick-aligned limit exists within market bounds")
        orders.append(
            SubmittedOrder(
                client_order_id=f"suggested-{uuid4()}",
                delivery_start_utc=points[t].timestamp_utc,
                side=side,
                order_type="LIMIT",
                volume_mw=volume,
                limit_price_eur_mwh=round(limit, 8),
            )
        )
    key = input_hash(request)
    validation = validate_selection(
        SuggestionSelection(baseline=request, input_hash=key, selected_orders=orders)
    )
    if not validation.feasible:
        raise ValueError("Combined schedule failed validation: " + "; ".join(validation.issues))
    # A feasible baseline does not need economically unhelpful additions.
    if validation.improvement_eur is not None and validation.improvement_eur <= 0:
        orders = []
        validation = validate_selection(SuggestionSelection(baseline=request, input_hash=key))
    return SuggestionResult(input_hash=key, orders=orders, validation=validation)
