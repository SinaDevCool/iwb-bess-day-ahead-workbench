"""Bounded lexicographic repair; never relax physical limits or protected orders."""

import math
import time
import warnings
from uuid import uuid4
import numpy as np
from scipy.optimize import milp, LinearConstraint
from backend.optimization.repair_model import build_repair_model
from backend.domain.schemas.orders import SubmittedOrder


def optimize_repair(request, points):
    """Return one repair plan, not an enumeration of alternative feasible plans."""
    objectives, integral, bounds, constraint, eligible, q, a = build_repair_model(request, points)
    constraints = [constraint]
    # All priority stages share this budget; a timeout is not infeasibility proof.
    deadline = time.monotonic() + 20
    result = None
    for objective in objectives:
        if not np.any(objective):
            continue
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return "timeout", []
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Unrecognized options detected:.*threads")
            result = milp(
                objective,
                integrality=integral,
                bounds=bounds,
                constraints=constraints,
                options={"time_limit": remaining, "mip_rel_gap": 0, "threads": 1},
            )
        if not result.success:
            return {1: "timeout", 2: "blocked"}.get(result.status, "error"), []
        # Preserve the previous optimum (within numerical tolerance), so later
        # economic gains cannot outweigh an earlier priority such as manual edits.
        constraints.append(LinearConstraint(objective, -np.inf, result.fun + 1e-7))
    if result is None or result.x is None:
        return "error", []
    baseline = request.baseline
    lot, step = baseline.market.volume_increment_mw, baseline.market.price_increment_eur_mwh
    # Decode integer lots to MW; rounding removes solver noise, not physical excess.
    quantities = {o.client_order_id: round(result.x[q + j]) * lot for j, o in enumerate(eligible)}
    orders = []
    for order in baseline.orders:
        volume = round(quantities.get(order.client_order_id, order.volume_mw), 8)
        if volume > 0:
            orders.append(order.model_copy(update={"volume_mw": volume}))
    # Random IDs identify the proposal; quantities are determined by the solve.
    generation = str(uuid4())
    n = len(points)
    for k in range(2 * n):
        volume = round(round(result.x[a + k]) * lot, 8)
        if volume <= 0:
            continue
        t, side = k % n, "BUY" if k < n else "SELL"
        raw = points[t].price_eur_mwh / step
        # Round BUY up and SELL down to keep the limit eligible at the forecast.
        price = (math.ceil(raw - 1e-9) if side == "BUY" else math.floor(raw + 1e-9)) * step
        orders.append(
            SubmittedOrder(
                client_order_id=f"suggested-{uuid4()}",
                delivery_start_utc=points[t].timestamp_utc,
                side=side,
                order_type="LIMIT",
                volume_mw=volume,
                limit_price_eur_mwh=round(price, 8),
                origin="suggested",
                protected=False,
                generation_id=generation,
            )
        )
    return "ready", orders
