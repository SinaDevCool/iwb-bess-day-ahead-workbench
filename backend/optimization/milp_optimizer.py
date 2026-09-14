from __future__ import annotations

import time
import warnings

from scipy.optimize import milp

from backend.domain.models import BatteryConfig, MarketConfig, PricePoint
from backend.optimization.dispatch_decoder import decode_dispatch
from backend.optimization.milp_model import build_model


def optimize_dispatch(
    prices: list[PricePoint],
    battery: BatteryConfig,
    market: MarketConfig,
    terminal_value_eur_per_mwh: float = 0,
    fixed_power: tuple[list[float], list[float]] | None = None,
):
    """Build, minimize negative decision value, and decode one feasible schedule."""
    n = len(prices)
    soc_offset = 2 * n
    objective, integrality, bounds, constraints = build_model(
        prices, battery, market, terminal_value_eur_per_mwh, fixed_power
    )
    started = time.perf_counter()
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Unrecognized options detected:.*threads")
        result = milp(
            c=objective,
            integrality=integrality,
            bounds=bounds,
            constraints=constraints,
            # A single solver thread keeps execution deterministic and avoids native
            # HiGHS worker teardown races when FastAPI tests create short-lived portals.
            options={
                # Quarter-hour suggestion models include discrete volume variables;
                # allow a bounded longer solve on smaller deployment instances.
                "time_limit": 20 if fixed_power is not None else 5,
                "mip_rel_gap": 1e-3 if fixed_power is not None else 1e-9,
                "threads": 1,
            },
        )
    solve_time_ms = round((time.perf_counter() - started) * 1000, 2)
    if not result.success or result.x is None:
        if result.status == 2:
            raise ValueError(
                "No feasible completion exists with the protected orders and current battery settings. Review those orders or settings."
            )
        if result.status == 1:
            raise ValueError(
                "Optimization reached its time limit. Your orders are unchanged. Retry the calculation."
            )
        raise ValueError(
            "Optimization could not complete. Your orders are unchanged. Retry the calculation or review the inputs."
        )

    if fixed_power is not None:
        result.x[: 2 * n] *= market.volume_increment_mw
    dispatch, throughput = decode_dispatch(result, prices, battery, market)
    return dispatch, {
        "engine": "scipy_highs_milp_v1",
        "prototype_solver": False,
        "solver_status": "optimal",
        "solve_time_ms": solve_time_ms,
        "mip_gap": float(getattr(result, "mip_gap", 0) or 0),
        "objective": "maximize energy sales - purchases - degradation - transaction fees + terminal energy value",
        "objective_value_eur": round(-result.fun, 2),
        "terminal_soc_mwh": round(result.x[soc_offset + n], 6),
        "throughput_mwh": round(throughput, 6),
        "constraint_status": "feasible",
        "constraints": [
            "SOC balance",
            "SOC envelope",
            "power and grid limits",
            "availability",
            "terminal SOC",
            "throughput limit",
            "binary charge/discharge exclusivity",
        ],
    }
