from __future__ import annotations

import math
from zoneinfo import ZoneInfo

from backend.domain.delivery_grid import delivery_grid
from backend.domain.models import (
    BatteryConfig,
    DispatchRow,
    MarketConfig,
    ValidationFinding,
    ValidationResult,
)
from backend.validation.common import (
    ENERGY_BALANCE_TOLERANCE_MWH,
    SOLVER_SOC_EPSILON_MWH,
    _result,
)


from backend.validation.dispatch_row_checks import physical_findings, energy_findings


def validate_dispatch(
    rows: list[DispatchRow], battery: BatteryConfig, market: MarketConfig | None = None
) -> ValidationResult:
    findings = []
    if market and rows:
        date = rows[0].timestamp_utc.astimezone(ZoneInfo(market.timezone)).strftime("%Y-%m-%d")
        if [r.timestamp_utc for r in rows] != delivery_grid(
            date, market.timezone, market.product_minutes
        ):
            findings.append(
                ValidationFinding(
                    severity="error",
                    code="interval_coverage",
                    message="Dispatch must match the complete delivery grid",
                )
            )
    previous_soc = battery.initial_soc_mwh
    throughput = 0.0
    eta = math.sqrt(battery.round_trip_efficiency)
    for row in rows:
        findings.extend(physical_findings(row, battery))
        findings.extend(energy_findings(row, previous_soc, eta, market))
        previous_soc = row.soc_mwh
        throughput += row.battery_energy_mwh
    if rows and rows[-1].soc_mwh < battery.target_soc_mwh - SOLVER_SOC_EPSILON_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="terminal_soc",
                message="Terminal SOC target not met",
                observed_value=rows[-1].soc_mwh,
                configured_limit=battery.target_soc_mwh,
                unit="MWh",
            )
        )
    if not rows:
        findings.append(
            ValidationFinding(
                severity="error", code="empty_schedule", message="No dispatch intervals generated"
            )
        )
    maximum_throughput = 2 * battery.capacity_mwh * battery.max_equivalent_cycles
    if throughput > maximum_throughput + ENERGY_BALANCE_TOLERANCE_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="cycle_limit",
                message="Dispatch exceeds the configured equivalent-cycle budget",
            )
        )
    return _result(findings)
