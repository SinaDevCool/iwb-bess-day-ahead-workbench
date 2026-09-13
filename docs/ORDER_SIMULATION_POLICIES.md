# Order simulation policies — v2

The homework simulator evaluates entered Market/Limit orders, not the exchange order book. The optimizer is an optional source of proposed orders, which enter the same simulation workflow.

## Price, allocation and physics

1. The entered interval forecast is the assumed clearing and settlement price.
2. Market orders have no price condition. BUY limits qualify at forecast <= limit; SELL limits qualify at forecast >= limit. Comparisons are inclusive and exact, without rounding or eligibility tolerance. Input tick validation is a separate concern. Python and TypeScript use the same boundary fixtures in `tests/fixtures/price_conditions.json`.
3. Price conditions are evaluated before checking for conflicting eligible BUY/SELL sides. Conditional opposite-side orders are valid inputs. Both eligible sides remain unsupported: no automatic netting, priority or partial fills.
4. Eligible same-side orders are checked as one physical batch. Infeasible batches are excluded without clipping. The displayed schedule carries forward the resulting actual SoC, not a hypothetical violating SoC.
5. Full allocation, including exactly-at-limit orders, is a deterministic assumption. Actual auction allocation, curtailment, partial fills and price impact are not modelled.

## Result interpretation

`submitted_portfolio_feasible` and `executed_schedule_feasible` answer different questions. A feasible schedule after excluding an infeasible batch is not a feasible entered portfolio. The shared UI presentation exposes that distinction in schedule, validation, KPIs and comparisons.

Net contribution is the sum of included simulated executions. If physical batches were excluded, label it **Contribution of remaining schedule**. If an end reserve fails, flag the portfolio even if every entered order executed. Price-ineligible orders alone are ordinary simulation outcomes, not physical failures. An empty portfolio is an idle simulation, not an execution success.

## Compatibility and market preset

New results record `deterministic_order_clearing_v2`, schema version 7 and typed assumptions. Older snapshots without typed assumptions retain a null/absent value; they are not recalculated or backfilled with v2 semantics. Restoring inputs and simulating creates a new result.

New Swiss cases default to 11:00 Europe/Zurich gate closure, based on https://www.epexspot.com/en/basicspowermarket. Explicit settings and historical snapshots remain unchanged. No live submission cutoff is enforced. The 15-minute product remains labelled simulation.

## Validation

Regression coverage includes conditional and overlapping limits, row-order invariance, exact/negative/zero boundary prices, full-fill energy conversion at 15/60 minutes, sequential SoC, reconciliation, and historical schema loading. Existing physical and workflow suites cover reserve, availability, aggregate power, stale drafts and forecast replacement.
