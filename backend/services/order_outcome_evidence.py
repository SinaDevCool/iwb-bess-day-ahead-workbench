"""Deterministic full-fill simulation. No database writes, random IDs or clock reads.

Each interval is evaluated as one batch; SoC is carried to the next interval.
A rejected batch is never silently clipped or converted into a partial fill.
"""

from __future__ import annotations

from datetime import timezone


def attach_interval_evidence(request, points, by_start, dispatch, order_results) -> None:
    """All orders in a delivery interval share its boundary SoC, regardless of outcome."""
    for outcome in order_results:
        interval_orders = by_start[
            outcome.submitted_order.delivery_start_utc.astimezone(timezone.utc)
        ]
        outcome.interval_order_count = len(interval_orders)
        row_index = next(
            i
            for i, p in enumerate(points)
            if p.timestamp_utc == outcome.submitted_order.delivery_start_utc
        )
        outcome.soc_before_mwh = (
            request.battery.initial_soc_mwh if row_index == 0 else dispatch[row_index - 1].soc_mwh
        )
        outcome.soc_after_mwh = dispatch[row_index].soc_mwh
    if len(order_results) != len(request.orders) or {
        x.submitted_order.client_order_id for x in order_results
    } != {x.client_order_id for x in request.orders}:
        raise ValueError("Every submitted order must have exactly one outcome")
