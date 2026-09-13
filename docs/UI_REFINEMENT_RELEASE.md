# Workspace UI refinement

Implemented the audit plan using existing workspace components, without a second simulation or optimization engine.

## Changes

1. Shared visual rhythm: numerical alignment, semantic color reuse, readable field hints, responsive editor placement and consistent dialog actions.
2. Existing Dialog now has a fixed header/footer and one scrolling body. Forecast, battery, proposal and replacement actions use the same footer. Cancel explicitly discards staged editor changes.
3. Forecast editing: optional paste disclosure, visible units/completeness, per-interval errors, invalid-field focus action and UTC disambiguation for repeated local hours.
4. Battery fields grouped by physical hardware, operating limits and wear cost; availability and transaction costs remain existing disclosures. Percentage efficiency converts back to the existing ratio payload.
5. Order editor identifies side/time, explains price eligibility separately from physical feasibility, and states the draft/re-simulation behavior.
6. Results retain separate price/power/energy charts, reduce repeated status text, and provide explicit keyboard-accessible detail buttons.
7. Analysis navigation names the active destination, removes duplicate empty states, and demotes technical IDs. History uses existing run naming and distinguishes Restore simulation from Open proposal. The existing history endpoint supplies display-name metadata.

## Verification

- 115 backend regression tests passed; optimizer and execution mathematics unchanged.
- 22 frontend tests passed, including percentage conversion, cancellation, footer action placement and field-error descriptions.
- Lint, TypeScript and production build checked.
- Local UI: forecast action footer remains visible at 1366 x 768; battery footer remains visible at 390 x 844 with no document horizontal overflow. Invalid 101% efficiency blocks applying and cancellation restores 90%. Temporary viewport overrides reset.
- Existing populated results and comparisons reused for visual inspection; no duplicate components or analytics calculation paths introduced.

This is representative regression and responsive validation, not an assertion that every possible input combination has been tested.
