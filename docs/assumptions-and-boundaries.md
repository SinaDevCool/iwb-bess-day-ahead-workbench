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
# Transaction fees

- The model applies variable fees to every executed grid-side MWh for both BUY and SELL orders.
- The ECC Day-Ahead clearing-fee default is **€0.015/MWh**, based on the ECC Price List release 084 dated 22 May 2026.
- The EPEX/exchange trading-fee default is **€0/MWh** because IWB's applicable membership tariff is not public in the materials available for this prototype. It is an explicit UI assumption that must be confirmed with IWB.
- Fixed membership, technical-access and data fees do not change the marginal dispatch decision and are therefore excluded. Imbalance costs, taxes, market impact and non-acceptance risk also remain out of scope.
