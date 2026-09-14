"""Order-level repair variables layered over the shared battery MILP constraints."""

import numpy as np
from scipy.optimize import Bounds, LinearConstraint
from scipy.sparse import hstack, vstack, csr_matrix
from backend.optimization.milp_model import build_model
from backend.domain.schemas.order_repair import can_revise
from backend.services.order_execution_rules import _clears


def build_repair_model(request, points):
    """Return ordered objectives, shared constraints and offsets for candidate decoding.

    Dispatch/retained/addition quantities use integer market lots; SoC uses MWh.
    Permissions restrict order variables, never the shared physical constraints.
    """
    baseline = request.baseline
    n = len(points)
    lot = baseline.market.volume_increment_mw
    dt = baseline.market.product_minutes / 60
    # Zero fixed powers select the shared integer-lot formulation without fixing
    # existing orders: the retained-order variables below express those obligations.
    c, integral, bounds, constraint = build_model(
        points, baseline.battery, baseline.market, 0, ([0.0] * n, [0.0] * n)
    )
    indexed = {p.timestamp_utc: t for t, p in enumerate(points)}
    eligible = [
        o
        for o in baseline.orders
        if _clears(o, points[indexed[o.delivery_start_utc]].price_eur_mwh)
    ]
    size, m = len(c), len(eligible)
    # q: retained order lots; z: changed order; a: added lots; b: added-order indicator.
    q, z, a, b = size, size + m, size + 2 * m, size + 2 * m + 2 * n
    total = b + 2 * n
    lower = np.r_[bounds.lb, np.zeros(total - size)]
    upper = np.r_[bounds.ub, np.full(total - size, np.inf)]
    integrality = np.r_[integral, np.ones(total - size)]
    rows, lo, hi = [], [], []

    def row(values, minimum, maximum):
        rows.append(
            csr_matrix(
                ([v for v in values.values()], ([0] * len(values), list(values))), shape=(1, total)
            )
        )
        lo.append(minimum)
        hi.append(maximum)

    manual, changes, energy = np.zeros(total), np.zeros(total), np.zeros(total)
    for j, order in enumerate(eligible):
        lots = round(order.volume_mw / lot)
        upper[q + j] = lots
        upper[z + j] = 1 if can_revise(request, order) else 0
        if not can_revise(request, order):
            lower[q + j] = lots
        # z=0 forces all original lots to remain; z=1 permits a reduction.
        row({q + j: 1, z + j: lots}, lots, np.inf)
        # A positive indicator represents at least one removed lot.
        row({q + j: 1, z + j: 1}, -np.inf, lots)
        manual[z + j] = int(order.origin == "manual")
        changes[z + j] = 1
        # Removed energy = original minus retained; the constant original total
        # does not affect minimization, so retained energy has a negative weight.
        energy[q + j] = -lot * dt
    for k in range(2 * n):
        maximum = bounds.ub[k]
        upper[a + k] = maximum if request.allow_additions else 0
        upper[b + k] = 1 if request.allow_additions and maximum > 0 else 0
        row({a + k: 1, b + k: -maximum}, -np.inf, 0)
        row({a + k: 1, b + k: -1}, 0, np.inf)
        coefficients = {k: 1, a + k: -1}
        for j, order in enumerate(eligible):
            index = indexed[order.delivery_start_utc] + (0 if order.side == "BUY" else n)
            if index == k:
                coefficients[q + j] = -1
        # Total physical dispatch = retained eligible orders + permitted additions.
        row(coefficients, 0, 0)
        changes[b + k] = 1
        energy[a + k] = lot * dt
    matrix = vstack(
        [hstack([constraint.A, csr_matrix((constraint.A.shape[0], total - size))]), *rows]
    ).tocsr()
    # Lexicographic priorities, not a weighted blend: manual edits, all edits,
    # removed/added grid MWh, then economic cost. One plan can contain many edits.
    objectives = [manual, changes, energy, np.r_[c, np.zeros(total - size)]]
    return (
        objectives,
        integrality,
        Bounds(lower, upper),
        LinearConstraint(matrix, np.r_[constraint.lb, lo], np.r_[constraint.ub, hi]),
        eligible,
        q,
        a,
    )
