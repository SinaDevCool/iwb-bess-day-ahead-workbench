"""Numerical tolerances are deliberately separate from display rounding."""

from __future__ import annotations

from decimal import Decimal

from backend.domain.models import (
    ValidationResult,
)

SOLVER_SOC_EPSILON_MWH = 1e-3
ORDER_SOC_BOUNDARY_EPSILON_MWH = 1e-6
ENERGY_BALANCE_TOLERANCE_MWH = 0.15
POWER_TOLERANCE_MW = 1e-3


def _is_increment(value: float, increment: float) -> bool:
    quotient = Decimal(str(value)) / Decimal(str(increment))
    return abs(quotient - quotient.to_integral_value()) <= Decimal("0.000001")


def _result(findings):
    if any(item.severity == "error" for item in findings):
        status = "failed"
    elif findings:
        status = "warning"
    else:
        status = "passed"
    return ValidationResult(status=status, findings=findings)
