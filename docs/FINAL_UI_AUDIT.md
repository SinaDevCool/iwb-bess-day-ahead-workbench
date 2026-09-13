# Final UI audit — 13 September 2026

Scope: local current workbench, preserving the existing implementation. No deployment requested.

## Observed before fixes

- Battery invalid capacity/efficiency/cycle settings and negative fees are blocked. Cancel preserves the draft.
- Limit below the BUY forecast is not executed; its interval contribution is zero. The resulting terminal reserve shortfall is flagged.
- Add/remove orders, Market/Limit switching, preview/apply/undo of optimizer orders, resolution replacement confirmation, and 15-minute MW-to-MWh conversion work.
- CSV of the wrong resolution is correctly rejected, but exposes a raw Pydantic error including framework internals.
- Shared chart keyboard navigation works, but Unpin remains visible after unpinning. Direct clicks rely on prior pointer movement to select an interval. Currency/order-count formatting is inconsistent.
- Invalid negative order volume displays a negative MWh helper despite being blocked.
- History shows saved inputs and scoped activity, but detail loading lacks feedback, focus is lost when the list disappears, and Refresh inside a detail refreshes the hidden list instead of the record.

## Planned fixes, in order

1. Format CSV domain validation errors as concise user messages. Reset the native file input after choosing so the same file can be retried. Remove duplicate manual-editor errors and disable editing during backend validation.
2. Resolve click/tap coordinates to an interval directly. Keep one timestamp-based selection across tracks, correct Pin/Unpin labels, use locale formatting and singular/plural counts, and make the desktop inspector sticky within the chart.
3. Only show energy conversion for valid positive volume; retain the inline validation error.
4. Add cancellable/generation-guarded History list/detail loading, focus the loaded record heading, and keep Refresh on the list only. Preserve exact snapshots and explicit restore semantics.
5. Add regression tests for these cases and run frontend tests/lint/type/build plus backend suite. Recheck browser inputs, charts, History, comparison, and responsive behavior.

## Boundaries

Commercial providers remain not connected. No live auction submission, partial-fill model, or production-readiness claim. Browser checks sample representative valid/invalid values; automated tests cover additional edge cases and do not prove every possible combination.

## Completed fixes and verification

All five planned fixes above are implemented. An additional browser finding was corrected: submitted-order feasibility now distinguishes physically rejected orders from an infeasible resulting schedule, rather than showing “0 rejections remaining margin” beside an Issue badge. Reserve failure can exist without any physical order rejection.

- Backend: 131 tests passed, including forecast imports and time-grid/DST coverage.
- Frontend: 45 tests passed across 11 files; lint, TypeScript checking, and production build passed.
- Browser: checked order entry/type/limit/volume changes, rejected price conditions, reserve failure, proposal preview/apply/undo, duration conversion, forecast import rejection and demo preview, configuration validation/cancel, History details/activity/pagination/restore, simulation/proposal comparison and alternate metric, chart keyboard pin/unpin, and a 390 px responsive viewport without document horizontal overflow. Temporary viewport overrides were reset.
- Restored the local sample to four executable orders: €1,825.26 net contribution and 56.3 MWh final stored energy; the UI confirms physical feasibility.
- The wrong-resolution CSV error formatting is covered by backend regression tests. The final reformatted message was not re-uploaded successfully in the browser after a file-chooser automation timeout.
- No commit, push, or production deployment was performed in this audit. Existing unrelated/uncommitted work was preserved. Test-created local history remains available.
