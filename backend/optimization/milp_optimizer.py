from __future__ import annotations

import math
import time
import warnings
from zoneinfo import ZoneInfo

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import lil_matrix

from backend.domain.models import BatteryConfig, DispatchRow, MarketConfig, PricePoint
from backend.domain.economics import calculate_interval


def optimize_dispatch(prices: list[PricePoint], battery: BatteryConfig, market: MarketConfig):
    """Solve one battery's Day-Ahead dispatch as a mixed-integer linear program."""
    n = len(prices)
    if not n:
        raise ValueError("No price intervals supplied")
    dt = market.product_minutes / 60
    eta = math.sqrt(battery.round_trip_efficiency)
    charge_offset, discharge_offset, soc_offset, mode_offset = 0, n, 2 * n, 3 * n + 1
    variable_count = 4 * n + 1

    objective = np.zeros(variable_count)
    for t, point in enumerate(prices):
        objective[charge_offset + t] = dt * (point.price_eur_mwh + battery.degradation_cost_eur_per_mwh * eta)
        objective[discharge_offset + t] = dt * (-point.price_eur_mwh + battery.degradation_cost_eur_per_mwh / eta)

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
    started = time.perf_counter()
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Unrecognized options detected:.*threads")
        result = milp(
            c=objective,
            integrality=integrality,
            bounds=Bounds(lower, upper),
            constraints=LinearConstraint(matrix.tocsr(), constraint_lower, constraint_upper),
            # A single solver thread keeps execution deterministic and avoids native
            # HiGHS worker teardown races when FastAPI tests create short-lived portals.
            options={"time_limit": 5, "mip_rel_gap": 1e-9, "threads": 1},
        )
    solve_time_ms = round((time.perf_counter() - started) * 1000, 2)
    if not result.success or result.x is None:
        detail = result.message or "unknown solver failure"
        raise ValueError(f"No optimal dispatch found: {detail}")

    local_zone = ZoneInfo(market.timezone)
    dispatch: list[DispatchRow] = []
    cumulative = 0.0
    throughput = 0.0
    for t, point in enumerate(prices):
        charge = 0 if result.x[charge_offset + t] < 1e-7 else result.x[charge_offset + t]
        discharge = 0 if result.x[discharge_offset + t] < 1e-7 else result.x[discharge_offset + t]
        if charge > 0:
            action, power = "charge", -charge
            economics = calculate_interval("BUY", charge, dt, point.price_eur_mwh, battery)
        elif discharge > 0:
            action, power = "discharge", discharge
            economics = calculate_interval("SELL", discharge, dt, point.price_eur_mwh, battery)
        else:
            action, power = "idle", 0.0
            economics = None
        if economics is None:
            grid_energy = battery_energy = pnl = 0.0
            sales_revenue = purchase_cost = degradation_cost = 0.0
        else:
            grid_energy = economics.grid_energy_mwh
            battery_energy = economics.battery_energy_mwh
            pnl = economics.contribution_eur
            sales_revenue = economics.sales_revenue_eur
            purchase_cost = economics.purchase_cost_eur
            degradation_cost = economics.degradation_cost_eur
        throughput += battery_energy
        cumulative += pnl
        dispatch.append(DispatchRow(
            interval=t,
            timestamp_utc=point.timestamp_utc,
            timestamp_local=point.timestamp_utc.astimezone(local_zone).isoformat(timespec="minutes"),
            price_eur_mwh=point.price_eur_mwh,
            action=action,
            power_mw=round(power, 6),
            grid_energy_mwh=round(grid_energy, 6),
            battery_energy_mwh=round(battery_energy, 6),
            soc_mwh=round(result.x[soc_offset + t + 1], 6),
            interval_pnl_eur=round(pnl, 2),
            cumulative_pnl_eur=round(cumulative, 2),
            sales_revenue_eur=round(sales_revenue, 2),
            purchase_cost_eur=round(purchase_cost, 2),
            degradation_cost_eur=round(degradation_cost, 2),
        ))
    return dispatch, {
        "engine": "scipy_highs_milp_v1",
        "prototype_solver": False,
        "solver_status": "optimal",
        "solve_time_ms": solve_time_ms,
        "mip_gap": float(getattr(result, "mip_gap", 0) or 0),
        "objective": "maximize energy sales - purchases - degradation",
        "objective_value_eur": round(-result.fun, 2),
        "terminal_soc_mwh": round(result.x[soc_offset + n], 6),
        "throughput_mwh": round(throughput, 6),
        "constraint_status": "feasible",
        "constraints": ["SOC balance", "SOC envelope", "power and grid limits", "availability", "terminal SOC", "throughput limit", "binary charge/discharge exclusivity"],
    }
