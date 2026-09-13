from __future__ import annotations

from backend.domain.models import (
    ValidationFinding,
)
from backend.validation.common import (
    ENERGY_BALANCE_TOLERANCE_MWH,
    ORDER_SOC_BOUNDARY_EPSILON_MWH,
    _is_increment,
)


def index_proposal_orders(orders, market, battery, dispatch, findings):
    """Validate interval identity, quantities and market ticks before reconstruction."""
    dt = market.product_minutes / 60
    max_charge = min(battery.max_charge_power_mw, battery.grid_limit_mw)
    max_discharge = min(battery.max_discharge_power_mw, battery.grid_limit_mw)
    interval_by_start = {row.timestamp_utc: row for row in dispatch}
    order_by_start: dict = {}
    for order in orders:
        if order.delivery_start_utc not in interval_by_start:
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="unknown_interval",
                    message=f"Order {order.order_id} does not match a delivery interval",
                )
            )
            continue
        if order.delivery_start_utc in order_by_start:
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="multiple_orders_interval",
                    message=f"Multiple orders exist for {order.delivery_local}",
                )
            )
        order_by_start[order.delivery_start_utc] = order
        limit = max_charge if order.side == "BUY" else max_discharge
        if order.volume_mw > limit + 1e-6:
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="order_power_limit",
                    message=f"Order {order.order_id} requests {order.volume_mw:g} MW; limit is {limit:g} MW",
                )
            )
        expected_energy = order.volume_mw * dt
        if abs(order.energy_mwh - expected_energy) > 1e-4:
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="energy_mismatch",
                    message=f"Order {order.order_id} MWh does not match MW × duration",
                )
            )
        if not _is_increment(order.volume_mw, market.volume_increment_mw):
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="volume_increment",
                    message=f"Order {order.order_id} volume violates the {market.volume_increment_mw:g} MW increment",
                )
            )
        if not _is_increment(order.limit_price_eur_mwh, market.price_increment_eur_mwh):
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="price_increment",
                    message=f"Order {order.order_id} price violates the {market.price_increment_eur_mwh:g} increment",
                )
            )

    return order_by_start


def check_soc_bounds(soc, battery, row, findings, below_reported, above_reported):
    """Report the first violation of each boundary using executable-order tolerance."""
    # Executable market orders are a discrete schedule, not a floating-point
    # solver candidate. Their reconstructed SoC must remain strictly inside
    # the configured physical envelope; build_executable_orders trims the
    # offending order by one market increment and revalidates it.
    if soc < battery.min_soc_mwh - ORDER_SOC_BOUNDARY_EPSILON_MWH and not below_reported:
        findings.append(
            ValidationFinding(
                severity="error",
                code="proposal_soc_below_min",
                message=f"Executable orders drive SoC below minimum at interval {row.interval}",
                interval=row.interval,
                observed_value=round(soc, 6),
                configured_limit=battery.min_soc_mwh,
                difference=round(soc - battery.min_soc_mwh, 6),
                tolerance=ORDER_SOC_BOUNDARY_EPSILON_MWH,
                unit="MWh",
                source="post-order physical reconstruction",
            )
        )
        below_reported = True
    if soc > battery.max_soc_mwh + ORDER_SOC_BOUNDARY_EPSILON_MWH and not above_reported:
        findings.append(
            ValidationFinding(
                severity="error",
                code="proposal_soc_above_max",
                message=f"Executable orders drive SoC above maximum at interval {row.interval}",
                interval=row.interval,
                observed_value=round(soc, 6),
                configured_limit=battery.max_soc_mwh,
                difference=round(soc - battery.max_soc_mwh, 6),
                tolerance=ORDER_SOC_BOUNDARY_EPSILON_MWH,
                unit="MWh",
                source="post-order physical reconstruction",
            )
        )
        above_reported = True
    return below_reported, above_reported


def check_proposal_terminal(soc, throughput, battery, findings) -> None:
    """End reserve and throughput are day-wide checks, not order-local conditions."""
    if soc < battery.target_soc_mwh - ORDER_SOC_BOUNDARY_EPSILON_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="proposal_terminal_soc",
                message=f"Executable orders finish at {soc:.2f} MWh, below the {battery.target_soc_mwh:g} MWh target",
                observed_value=round(soc, 6),
                configured_limit=battery.target_soc_mwh,
                difference=round(soc - battery.target_soc_mwh, 6),
                tolerance=ORDER_SOC_BOUNDARY_EPSILON_MWH,
                unit="MWh",
                source="post-order physical reconstruction",
            )
        )
    maximum_throughput = 2 * battery.capacity_mwh * battery.max_equivalent_cycles
    if throughput > maximum_throughput + ENERGY_BALANCE_TOLERANCE_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="proposal_cycle_limit",
                message="Edited orders exceed the configured equivalent-cycle budget",
            )
        )
