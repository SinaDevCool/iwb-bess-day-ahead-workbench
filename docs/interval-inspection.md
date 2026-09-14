# Interval inspection

The schedule table has one row per delivery interval. Selecting a row opens one
separate panel below its scroll container; it never inserts detail rows into the
schedule. Chart selection and saved-result identity continue to scope inspection.

The executed-orders card counts orders, with distinct executed UTC delivery
instants below it. It does not count bars or merge repeated local DST hours.

Combined stored energy is the interval's shared start/end state. Per-order
stored-energy changes use the existing backend `soc_delta_mwh` evidence; grid
energy and stored energy remain distinct. Historical missing evidence displays
an em dash instead of a fabricated contribution.

Add and Edit share order fields and same-side entered-volume context. Editing
replaces the current order once in the total. These totals do not promise
execution or net opposing sides.

An At limit indicator describes the existing full-allocation simulation
assumption, not guaranteed exchange allocation. Draft eligibility uses the
existing comparator; saved details use the saved forecast. No clearing,
optimization or combined-batch validation rules are changed by this UI.

Regression coverage: interval table component tests, order-volume-context tests,
order-ticket tests, plus the existing 15/60-minute, market/limit and DST suites.
