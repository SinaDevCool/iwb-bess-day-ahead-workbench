"""MILP coefficient assembly. Powers are MW; state variables are boundary MWh."""

from __future__ import annotations

import math

import numpy as np
from scipy.optimize import Bounds, LinearConstraint
from scipy.sparse import lil_matrix

from backend.domain.models import PricePoint, BatteryConfig, MarketConfig
from backend.domain.economics import effective_transaction_fee


def build_model(
    prices: list[PricePoint],
    battery: BatteryConfig,
    market: MarketConfig,
    terminal_value_eur_per_mwh: float,
) -> tuple[np.ndarray, np.ndarray, Bounds, LinearConstraint]:
    """Assemble minimization costs and MW/MWh constraints; this function never solves."""
    n = len(prices)
    if not n:
        raise ValueError("No price intervals supplied")
    dt = market.product_minutes / 60
    eta = math.sqrt(battery.round_trip_efficiency)
    transaction_fee = effective_transaction_fee(market)
    charge_offset, discharge_offset, soc_offset, mode_offset = 0, n, 2 * n, 3 * n + 1
    variable_count = 4 * n + 1

    # scipy.milp minimizes c @ x: purchases/wear/fees are positive costs;
    # sales and terminal energy value are negative costs. No price forecasting
    # happens here: the caller supplies one complete price trajectory.
    objective = np.zeros(variable_count)
    for t, point in enumerate(prices):
        objective[charge_offset + t] = dt * (
            point.price_eur_mwh + transaction_fee + battery.degradation_cost_eur_per_mwh * eta
        )
        objective[discharge_offset + t] = dt * (
            -point.price_eur_mwh + transaction_fee + battery.degradation_cost_eur_per_mwh / eta
        )
    # A continuation value prevents an artificial end-of-horizon sell-off. The
    # hard terminal reserve remains in force. The constant value of that reserve
    # is omitted from c @ x because it cannot change the optimal decision;
    # reporting subtracts it when showing incremental continuation value.
    objective[soc_offset + n] = -terminal_value_eur_per_mwh

    lower = np.zeros(variable_count)
    upper = np.full(variable_count, np.inf)
    max_charge = min(battery.max_charge_power_mw, battery.grid_limit_mw)
    max_discharge = min(battery.max_discharge_power_mw, battery.grid_limit_mw)
    upper[charge_offset:discharge_offset] = max_charge
    upper[discharge_offset:soc_offset] = max_discharge
    lower[soc_offset:mode_offset] = battery.min_soc_mwh
    upper[soc_offset:mode_offset] = battery.max_soc_mwh
    lower[soc_offset] = upper[soc_offset] = battery.initial_soc_mwh
    lower[soc_offset + n] = max(battery.min_soc_mwh, battery.target_soc_mwh)
    upper[mode_offset:] = 1
    for t in battery.unavailable_intervals:
        if not 0 <= t < n:
            raise ValueError(f"Unavailable interval {t} is outside the delivery day (0-{n - 1})")
        upper[charge_offset + t] = 0
        upper[discharge_offset + t] = 0

    # SoC balance plus two operating-mode inequalities per interval.
    row_count = n + 2 * n + 1
    matrix = lil_matrix((row_count, variable_count))
    constraint_lower = np.full(row_count, -np.inf)
    constraint_upper = np.full(row_count, np.inf)
    row = 0
    for t in range(n):
        matrix[row, soc_offset + t + 1] = 1
        matrix[row, soc_offset + t] = -1
        matrix[row, charge_offset + t] = -eta * dt
        matrix[row, discharge_offset + t] = dt / eta
        constraint_lower[row] = constraint_upper[row] = 0
        row += 1
    for t in range(n):
        matrix[row, charge_offset + t] = 1
        matrix[row, mode_offset + t] = -max_charge
        constraint_upper[row] = 0
        row += 1
        matrix[row, discharge_offset + t] = 1
        matrix[row, mode_offset + t] = max_discharge
        constraint_upper[row] = max_discharge
        row += 1
    for t in range(n):
        matrix[row, charge_offset + t] = eta * dt
        matrix[row, discharge_offset + t] = dt / eta
    constraint_upper[row] = 2 * battery.capacity_mwh * battery.max_equivalent_cycles

    integrality = np.zeros(variable_count)
    integrality[mode_offset:] = 1
    return (
        objective,
        integrality,
        Bounds(lower, upper),
        LinearConstraint(matrix.tocsr(), constraint_lower, constraint_upper),
    )
