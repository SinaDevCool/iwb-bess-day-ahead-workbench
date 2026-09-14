# Assumptions and boundaries

## Case and illustrative configuration

The case is interpreted as a 100 MWh / approximately 50 MW two-hour battery. The implementation uses nominal capacity for cycle accounting. Its default 10–90 MWh operating envelope gives 80 MWh usable within that envelope; do not call this 100 MWh of operationally usable energy.

Other illustrative defaults: 50 MWh initial energy, 50 MWh minimum end reserve, 90% round-trip efficiency, €3/MWh battery-side throughput wear, 1.5 equivalent full cycles per day and no unavailable intervals. Forecast examples are illustrative, not measured or commercially sourced forecasts.

Configured transaction costs apply per grid-side MWh. The default clearing cost is €0.015/MWh, an assumption requiring applicability confirmation. Exchange fees are excluded unless configured; excluded is not a confirmed contractual zero. Fixed membership/data costs, taxes, imbalance costs and price impact are outside the model.

## Current calculation workflow

Entered forecast + Market/Limit orders → price eligibility → chronological physical batch checks → shared economics → dispatch chart and saved result.

**Simulate battery dispatch** never revises order volumes. Optional suggestions and repairs use MILP, preview changes and require explicit application. They then pass the same simulation checks. No approval or application submits anything to an exchange.

[Order simulation policies](ORDER_SIMULATION_POLICIES.md) is the single reference for allocation, price conditions, opposing sides and exclusion semantics. In particular, physical exclusion is not an exchange rejection, and qualifying opposing trades are not netted.

## Units and interpretation

- Grid energy = order MW × product hours.
- Symmetric one-way efficiency = square root of round-trip efficiency.
- Charging increases stored energy by grid energy × efficiency; discharging decreases it by grid energy / efficiency.
- Battery throughput counts both battery-side charging and discharging. EFC = throughput / (2 × nominal capacity).
- End reserve is a minimum, not an exact target. Cycle budget is not a minimum waiting time between trades.
- Net contribution = sales − purchases − wear − configured transaction costs. Negative prices can make charging financially positive.
- Charge is negative and discharge positive on the power chart. Financial colors follow contribution sign independently.
- Display rounding is not a feasibility tolerance. Exact interval/order evidence is available in Interval Detail; no separate Physical Validation tab is required.
- Changing inputs makes previous results outdated. A feasible repair preview is not yet the applied or simulated portfolio.

## Not a live trading or asset-control system

The forecast is the assumed clearing and settlement price. Full allocation is assumed for qualifying feasible batches, including at-limit orders. Actual clearing, partial allocation, price impact and opposing-trade netting are not reproduced. No live exchange connection, order submission, battery control or connected commercial forecast service is provided.

Market presets (CH, duration, gate closure, increments and bounds) are modelling assumptions, not exchange certification. The 15-minute choice is labelled simulation. Internal UTC timestamps retain the correct local delivery day, including DST. Display timezone does not change delivery instants or calculations.

Before operational use, confirm exchange/account/product rules, asset capacity/envelope, ramps, auxiliaries, warranties, availability, fees, imbalance exposure, approval/access controls and integrations with IWB. Add durable persistence and operational monitoring; current demo history is not a production record system.

## Archived capabilities

The old proposal-settings, scenario/comparison and dedicated physical-validation screens are outside the active homework journey. Legacy risk and horizon services remain for compatibility/reuse; their terminal-value and scenario features must not be advertised as controls in today's workbench. Historical documents retain their original context.
