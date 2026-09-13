from __future__ import annotations


from backend.domain.models import (
    BatteryConfig,
    DispatchRow,
    MarketConfig,
    ValidationFinding,
)
from backend.validation.common import (
    ENERGY_BALANCE_TOLERANCE_MWH,
    POWER_TOLERANCE_MW,
    SOLVER_SOC_EPSILON_MWH,
)


def physical_findings(row: DispatchRow, battery: BatteryConfig) -> list[ValidationFinding]:
    """Interval-local envelope and operating-mode checks; no state mutation."""
    findings = []
    if row.soc_mwh < battery.min_soc_mwh - SOLVER_SOC_EPSILON_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="soc_below_min",
                message="SOC is below the configured minimum",
                interval=row.interval,
            )
        )
    if row.soc_mwh > battery.max_soc_mwh + SOLVER_SOC_EPSILON_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="soc_above_max",
                message="SOC is above the configured maximum",
                interval=row.interval,
            )
        )
    if abs(row.power_mw) > battery.grid_limit_mw + POWER_TOLERANCE_MW:
        findings.append(
            ValidationFinding(
                severity="error",
                code="grid_limit",
                message="Grid power limit exceeded",
                interval=row.interval,
            )
        )
    if row.power_mw < -battery.max_charge_power_mw - POWER_TOLERANCE_MW:
        findings.append(
            ValidationFinding(
                severity="error",
                code="charge_power_limit",
                message="Battery charge limit exceeded",
                interval=row.interval,
            )
        )
    if row.power_mw > battery.max_discharge_power_mw + POWER_TOLERANCE_MW:
        findings.append(
            ValidationFinding(
                severity="error",
                code="discharge_power_limit",
                message="Battery discharge limit exceeded",
                interval=row.interval,
            )
        )
    if row.interval in battery.unavailable_intervals and row.action != "idle":
        findings.append(
            ValidationFinding(
                severity="error",
                code="unavailable",
                message="Dispatch scheduled during unavailability",
                interval=row.interval,
            )
        )
    if (
        (row.action == "charge" and row.power_mw >= -POWER_TOLERANCE_MW)
        or (row.action == "discharge" and row.power_mw <= POWER_TOLERANCE_MW)
        or (row.action == "idle" and abs(row.power_mw) > POWER_TOLERANCE_MW)
    ):
        findings.append(
            ValidationFinding(
                severity="error",
                code="operating_mode",
                message="Dispatch action and signed power are inconsistent",
                interval=row.interval,
            )
        )
    return findings


def energy_findings(
    row: DispatchRow, previous_soc: float, eta: float, market: MarketConfig | None
) -> list[ValidationFinding]:
    """Reconcile one boundary transition using grid-side power and battery-side losses."""
    findings = []
    duration_hours = (
        market.product_minutes / 60
        if market
        else (
            row.grid_energy_mwh / abs(row.power_mw)
            if abs(row.power_mw) > POWER_TOLERANCE_MW
            else 0.0
        )
    )
    if market and abs(row.grid_energy_mwh - abs(row.power_mw) * duration_hours) > 1e-5:
        findings.append(
            ValidationFinding(
                severity="error",
                code="grid_energy",
                message="Grid energy does not match power times delivery duration",
                interval=row.interval,
            )
        )
    expected_delta = 0.0
    if row.power_mw < -POWER_TOLERANCE_MW:
        expected_delta = abs(row.power_mw) * duration_hours * eta
    elif row.power_mw > POWER_TOLERANCE_MW:
        expected_delta = -row.power_mw * duration_hours / eta
    if market and abs(row.battery_energy_mwh - abs(expected_delta)) > 1e-5:
        findings.append(
            ValidationFinding(
                severity="error",
                code="battery_energy",
                message="Battery throughput does not reconcile with power and efficiency",
                interval=row.interval,
            )
        )
    if abs((row.soc_mwh - previous_soc) - expected_delta) > ENERGY_BALANCE_TOLERANCE_MWH:
        findings.append(
            ValidationFinding(
                severity="error",
                code="energy_balance",
                message="State-of-charge movement does not reconcile with power, duration and efficiency",
                interval=row.interval,
            )
        )
    return findings
