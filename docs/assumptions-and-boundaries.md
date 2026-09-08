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
- Availability-stress scenario uses an illustrative 18:00–20:00 outage.

## Calculation conventions

- Charge is negative and discharge positive in dispatch charts.
- Expected contribution equals sales revenue minus charging purchases minus battery degradation.
- Round-trip efficiency is split symmetrically with its square root on charge and discharge.
- Equivalent full cycles use battery-side throughput divided by twice nominal capacity.
- The terminal SoC input is a minimum reserve; the optimizer may finish above it.

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
