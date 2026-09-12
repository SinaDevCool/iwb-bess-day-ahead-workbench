# Assumptions and boundaries

## Case-derived

- 100 MWh usable capacity.
- Two-hour system interpreted as approximately 50 MW symmetric power.
- Frontend includes simulation and Day-Ahead order generation.

## Illustrative defaults

- 10–90 MWh operating envelope.
- 50 MWh initial SoC and minimum terminal reserve.
- 90% round-trip efficiency.
- €3/MWh battery-side throughput degradation cost.
- 1.5 equivalent full cycles per day.
- Illustrative price forecast for 9 September 2026.
- Availability presets are independent of price scenarios and use local-time windows.

## Calculation conventions

- Charge is negative and discharge positive in dispatch charts.
- Expected contribution equals sales revenue minus charging purchases, battery degradation and configured marginal transaction fees.
- Round-trip efficiency is split symmetrically with its square root on charge and discharge.
- Equivalent full cycles use battery-side throughput divided by twice nominal capacity.
- The terminal SoC input is a minimum reserve; the optimizer may finish above it.
- Continuous solver quantities are floored to the configured market-volume increment. The complete discrete order package is then reconstructed interval by interval and repaired until minimum SoC, maximum SoC and terminal reserve are satisfied without using the energy-balance tolerance as extra capacity.
- Solver SoC feasibility uses a 0.001 MWh numerical epsilon. Executable-order SoC boundaries use a strict 0.000001 MWh comparison. The separate 0.15 MWh tolerance applies only to independent interval energy-balance reconciliation.
- Primary screens round values for readability; exact reconstructed values and calculation evidence remain available in Physical Validation.

## Calculation chain

Configuration → continuous MILP optimization → market-increment conversion → sequential SoC reconstruction and repair → physical validation → order economics → summaries and saved-run comparison.

The homework-facing order simulation is intentionally a separate entry path that reuses the same domain and calculation services:

Entered forecast + Market/Limit orders → side-specific price acceptance → chronological SoC reconstruction → physical validation → shared economics and dispatch chart → persisted audit result.

- A Market order is price-eligible by definition.
- A BUY Limit order is eligible when forecast/clearing price ≤ its limit.
- A SELL Limit order is eligible when forecast/clearing price ≥ its limit.
- Eligible orders execute at the entered forecast price in this deterministic demo. An order that cannot execute in full within the battery envelope is clearly rejected as physically infeasible rather than silently resized.

Rounding and repair evidence records the market increment, adjusted quantities, repair steps, removed volume and contribution impact for each saved run.

## Must be confirmed with IWB

- Exchange/auction route and exact bidding-zone setup.
- Product duration and market time unit.
- Gate closure and operational deadlines.
- Minimum volume and price increments.
- Supported order types and price bounds.
- Battery warranty, ramping, auxiliary-load and availability constraints.
- Treatment of fees, imbalance exposure and taxes.
- Approval workflow and system integrations.

## Safety boundary

All generated orders are previews. Approval changes only local demo state. No live connector exists.
# Transaction fees

- The model applies variable fees to every executed grid-side MWh for both BUY and SELL orders.
- The ECC Day-Ahead clearing-fee default is **€0.015/MWh**, based on the ECC Price List release 085 effective 1 September 2026; applicability remains subject to IWB confirmation.
- The EPEX/exchange trading fee is **not configured and excluded by default** because IWB's contractual tariff was not supplied. A numeric zero is treated as a real fee only after the user explicitly enables the contractual fee.
- Fixed membership, technical-access and data fees do not change the marginal dispatch decision and are therefore excluded. Imbalance costs, taxes, market impact and non-acceptance risk also remain out of scope.
