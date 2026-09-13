# Deployed UI audit and targeted fix plan — 13 September 2026

## Release-first requirement

Commit `68b62e0` was pushed to main and confirmed Live in Render before this audit. The preceding release passed 115 backend and 16 frontend tests and a production build.

## Observed checks on the deployed application

- Initial forecast, four example orders and main navigation loaded.
- Forecast editor rejected a two-price paste; a complete time-labelled 24-price paste, including a negative price, applied correctly and changed provenance to entered forecast.
- Order volume zero produced validation feedback. Side, type, delivery, remove, undo and add controls changed the draft correctly.
- All eleven battery fields rejected invalid numeric/relational boundaries. Negative clearing fees disabled applying settings. Confirmed exchange fee and outage selections applied.
- Simulation produced executed, price-rejected and outage-rejected outcomes; a terminal reserve failure correctly marked the resulting schedule invalid.
- Financial breakdown, optional columns and rejected-order detail expanded correctly.
- History refresh and saved simulation restoration reproduced the saved cash and execution evidence.

## Findings and implementation sequence

1. `frontend/src/components/workspace/order-workspace.tsx`: native confirmations interrupted the in-app browser audit. Replace them with the existing application dialog pattern, explicit cancellation/confirmation, and preserved Undo. This is also a consistency improvement; the automation stall alone does not prove a normal-browser defect.
2. The example input request lacked a busy state and could overwrite later edits. Add loading feedback and snapshot identity guards to example/date/history replacement requests. Reject obsolete replacement responses with a retry explanation.
3. Generation checked hidden terminal/lookahead values. Validate only fields relevant to the chosen policy and send neutral defaults for inactive fields.
4. Battery labels included their error messages, changing accessible names. Use stable accessible names and separately associated descriptions.
5. `workspace/order-evidence.tsx`: rounded detail values did not visibly reconcile to cent-precision totals. Show cents, display signed purchase/degradation/fee contributions without double negatives, add an explicit empty-order state, and remove duplicate validation text.

## Regression coverage added

- Reset cancellation and confirmation without `window.confirm`.
- Delayed example response cannot overwrite a newer order edit.
- Battery field label remains stable while its error description changes.
- Switching from invalid configured terminal value to minimum reserve does not block proposal generation.

## Audit limits

The browser automation stalled after invoking a native confirmation; subsequent clicks on other tabs did not reliably execute. Proposal generation/application, sensitivities and advanced optimizer controls were therefore not all rechecked interactively during this audit. Prior tests and backend regression coverage remain useful but do not substitute for that outstanding live interaction check. No live exchange submission exists or was attempted.
