# IWB interview runbook

## Before the interview

1. Start the backend on port 8100.
2. Build and start the frontend on port 3100.
3. Open `http://127.0.0.1:3100/present`.
4. Open `http://127.0.0.1:3100` in a second tab.
5. Confirm the safety banner says simulation only and the initial result says `passed`.
6. Keep the PowerPoint as the primary presentation and the product as supporting evidence.

## Two-minute product demonstration

1. Open the live workbench from presentation mode.
2. Point to 100 MWh, the inferred 50 MW, and the explicit assumptions.
3. Explain price, power and SoC on the synchronized chart.
4. Open Auction orders and explain BUY/SELL conversion.
5. Open Feasibility proof and show objective, terminal SoC and constraints.
6. Select Downside, run again and open Scenario comparison.
7. Approve the proposal and emphasize that approval permits demo export only.
8. Open Audit trail and show the reproducible event history.

## Closing sentence

“The frontend gives spot traders a fast, explainable and controlled path from a forecast to a physically feasible Day-Ahead order proposal.”

## Failure fallback

If the API is unavailable, use the PowerPoint mockup. Do not spend interview time troubleshooting. Never describe the prototype as connected to a live exchange.

