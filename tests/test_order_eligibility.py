"""Regression contract: price eligibility precedes physical batch validation."""

import pytest
import json
from pathlib import Path

from backend.domain.models import OrderSimulationResult
from backend.services.order_simulation_service import run_order_simulation
from test_order_simulation import order, request_with
from backend.services.order_execution_rules import _clears
from backend.domain.models import MarketConfig, SubmittedOrder
from backend.services.forecast_service import build_demo_forecast


@pytest.mark.parametrize(
    "price,expected",
    [
        (30, ("EXECUTED", "NOT_EXECUTED")),
        (70, ("NOT_EXECUTED", "NOT_EXECUTED")),
        (110, ("NOT_EXECUTED", "EXECUTED")),
    ],
)
@pytest.mark.parametrize("reverse", [False, True])
def test_conditional_sides(price, expected, reverse, tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    orders = [
        (5, order("buy", "BUY", "LIMIT", 10, 40)),
        (5, order("sell", "SELL", "LIMIT", 10, 100)),
    ]
    request = request_with(list(reversed(orders)) if reverse else orders)
    request.prices[5].price_eur_mwh = price
    result = run_order_simulation(request)
    outcomes = {
        o.submitted_order.client_order_id: o.execution_status.value for o in result.order_results
    }
    assert outcomes == dict(zip(("buy", "sell"), expected))
    assert result.summary.infeasible_order_count == 0


def test_overlapping_limits_conflict_only_after_eligibility(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(
        request_with(
            [
                (5, order("buy", "BUY", "LIMIT", 10, 40)),
                (5, order("sell", "SELL", "LIMIT", 10, 30)),
                (5, order("out", "SELL", "LIMIT", 10, 100)),
            ]
        )
    )
    assert result.summary.infeasible_order_count == 2
    assert result.summary.not_executed_order_count == 1
    assert len(result.order_results) == 3


def test_explicit_assumptions_and_legacy_read(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    result = run_order_simulation(request_with([]))
    assert result.assumptions.price_comparison == "inclusive_exact"
    assert result.audit["simulation_engine"] == "deterministic_order_clearing_v2"
    saved = result.model_dump(mode="json")
    del saved["assumptions"]
    saved["audit"]["simulation_engine"] = "deterministic_order_clearing_v1"
    legacy = OrderSimulationResult.model_validate(saved)
    assert legacy.assumptions is None
    assert legacy.audit["simulation_engine"] == "deterministic_order_clearing_v1"


@pytest.mark.parametrize(
    "case", json.loads((Path(__file__).parent / "fixtures/price_conditions.json").read_text())
)
def test_shared_price_comparison_contract(case):
    submitted = SubmittedOrder(
        client_order_id="boundary",
        delivery_start_utc="2026-09-09T00:00:00Z",
        side=case["side"],
        order_type="LIMIT",
        volume_mw=1,
        limit_price_eur_mwh=case["limit"],
    )
    assert _clears(submitted, case["forecast"]) is case["eligible"]


@pytest.mark.parametrize("minutes", [15, 60])
def test_eligible_batch_soc_and_reconciliation(minutes, tmp_path, monkeypatch):
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "test.sqlite")
    request = request_with([])
    request.market.product_minutes = minutes
    request.prices = build_demo_forecast(request.delivery_date, request.market)
    request.orders = [
        SubmittedOrder(
            client_order_id=key,
            delivery_start_utc=request.prices[index].timestamp_utc,
            side=side,
            order_type="MARKET",
            volume_mw=volume,
        )
        for key, index, side, volume in [
            ("buy1", 5, "BUY", 10),
            ("buy2", 5, "BUY", 10),
            ("sell", 10, "SELL", 5),
        ]
    ]
    result = run_order_simulation(request)
    assert result.summary.executed_order_count == 3
    assert len(result.dispatch) == 1440 // minutes
    assert result.order_results[-1].soc_before_mwh == pytest.approx(result.dispatch[5].soc_mwh)
    assert result.summary.net_contribution_eur == pytest.approx(
        sum(o.contribution_eur for o in result.order_results)
    )
    assert result.summary.net_contribution_eur == pytest.approx(
        sum(r.interval_pnl_eur for r in result.dispatch)
    )
    assert sum(o.executed_energy_mwh for o in result.order_results) == 25 * minutes / 60


def test_swiss_default_preserves_explicit_historical_time():
    assert MarketConfig().gate_closure_local == "11:00"
    assert MarketConfig(gate_closure_local="12:00").gate_closure_local == "12:00"
