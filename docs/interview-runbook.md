# Interview runbook and acceptance demonstration

## Setup

Follow [README](../README.md#run-locally) to run the local app, or open the deployed workbench at `/`. Do not use the legacy `/present` journey for this demonstration. The frontend is a static export: production uses the Docker/FastAPI mount, not `next start`.

Use a fresh browser session to preserve existing drafts. Select 9 September 2026, 60-minute products and CET/CEST. Use the default battery and costs documented in [assumptions](assumptions-and-boundaries.md).

## Core demonstration (about three minutes)

1. Open **Replace forecast / Load forecast**. Paste the complete [existing CSV fixture](../tests/fixtures/da-forecast-2026-09-09.csv), validate, review and **Apply forecast**. These are illustrative prices. UTC CSV timestamps display in CET/CEST.
2. In **Auction Orders**, enter each order with **Add order**, confirming each ticket:

   | Delivery (CET/CEST) | Side/type | MW | Limit €/MWh |
   | --- | --- | ---: | ---: |
   | 05:00–06:00 | BUY Market | 20 | No limit |
   | 06:00–07:00 | BUY Limit | 20 | 40 |
   | 18:00–19:00 | SELL Limit | 15 | 130 |

3. Click **Simulate battery dispatch**. Two of three orders execute. The SELL is price-ineligible because €120 forecast is below its €130 minimum; this is not physical infeasibility.
4. Open **Dispatch & Economics → Interval Detail**, inspect 18:00 and use **Edit order**. Change its limit to €110/MWh. Previous results become outdated; editing does not itself simulate.
5. Simulate again. All three orders execute. Inspect the synchronized charts and interval evidence.
6. Explain that simulation evaluates entered quantities. **Re-optimize** offers separate suggestions/repairs, applied only after review.

## Physical exclusion extension

Change the 05:00 BUY from 20 to 60 MW and simulate. It exceeds the 50 MW limit and is excluded, not clipped. Inspect its explanation, restore 20 MW and simulate again. The corrected three-order result returns.

## Numerical verification and acceptance record

The acceptance regression in `tests/test_order_simulation.py` imports the same CSV through the existing endpoint and uses the canonical simulation engine. It verifies initial price rejection, correction, physical exclusion, restoration and reconciliation. No duplicate calculator is introduced.

Automated acceptance verified on 14 September 2026:

| Checkpoint | Executed | Net contribution | Final stored energy |
| --- | ---: | ---: | ---: |
| Initial SELL limit 130 | 2/3 | -€1,454.44 | 87.947 MWh |
| Corrected SELL limit 110 | 3/3 | €297.91 | 72.136 MWh |
| BUY increased to 60 MW | 2/3 | €1,055.13 | 53.162 MWh |
| BUY restored to 20 MW | 3/3 | €297.91 | 72.136 MWh |

The physically excluded case reports only the remaining schedule's contribution; it is not a feasible improvement. Corrected throughput is 53.759 MWh. The regression reconciles interval contributions and final stored energy with the summary, and verifies that simulation preserves entered orders.

Validation: 231 backend tests and 174 frontend tests passed, along with lint, type checking, formatting, structure checks and the production build. The local browser demonstration was attempted but could not be completed because the existing local server returned an empty response; the table above records automated API acceptance, not a completed browser walkthrough.

## Boundaries to explain

“This prototype evaluates entered orders using the forecast as the assumed clearing and settlement price. It calculates a simulated battery dispatch schedule; it does not submit orders or control a battery.”

Full allocation is assumed for qualifying feasible batches, including at-limit orders. Actual auction allocation, partial fills and opposing-trade netting are not modelled. Physical exclusion is a simulator decision, not an exchange rejection. See [execution policies](ORDER_SIMULATION_POLICIES.md).

## Submission and fallback

Core requirements: forecast entry, Market/Limit order entry and a graphical resulting battery schedule. Optimization is optional supporting functionality. This frontend uses React/Next.js; explain that choice if the assignment prefers Vue.js.

If the service is unavailable, use prepared screenshots and the recorded acceptance results. Never describe it as exchange-connected. Free Render storage is ephemeral; saved history is not production-grade durable storage.

