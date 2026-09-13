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

## Live follow-up on release `9165af4`

The fresh browser session recovered after deployment. The following additional interactions passed:

- Application confirmation cancellation and staged battery-reset cancellation.
- Proposal preview, explicit application and simulation: eight of eight orders executed, final reserve 50 MWh, net contribution EUR 6,201.25.
- Hidden invalid terminal value no longer prevents a minimum-reserve proposal. Downside-protected and next-day opportunity-proxy generation also completed.
- Sensitivity calculation and lever selection; comparison of two saved runs across all four metrics; full configuration, reference switching and run renaming.
- Advanced optimizer navigation, physical-validation filters, calculation evidence, exact values and solver details.
- Trader limit adjustment with rationale, full revalidation, demo approval and enabled CSV export. Export was clicked; downloaded file contents were not independently inspected in this browser pass.
- Return to the primary order simulator preserved its separate eight-order draft.
- Primary input layout had no document-level horizontal overflow at 390, 1366 and 1920 pixel viewport widths. The temporary viewport override was reset. No warning/error console entries were returned for the current session.

Validation completed with 115 backend tests, 20 frontend tests, lint, TypeScript and the production build passing.

## Audit limits

This is a representative interaction and boundary audit, not proof of every possible combination. Native date-input automation did not reliably commit the entered date, so the live daylight-saving date-change confirmation remains unverified; delivery-grid regression tests cover DST logic. Legacy advanced configuration was sampled rather than every field combination being repeated. No live exchange submission exists or was attempted.
