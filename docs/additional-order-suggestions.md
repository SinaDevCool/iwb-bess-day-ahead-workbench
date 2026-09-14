# Additional-order suggestions

Auction Orders owns one editable order list. **Suggest additional orders** opens
a temporary review; **Add selected orders** appends; **Simulate orders** evaluates
the final list without generating anything. Cancel has no effect. Undo restores
the complete prior draft. No exchange submission is implemented.

## Calculation

The shared MILP model receives lower bounds for total charging/discharging from
price-eligible entered orders. All battery, availability, cycle and terminal
constraints apply to total power. Orders that fail their forecast price condition
remain in the list but do not consume energy. Conflicting eligible sides and
unavailable/over-capacity fixed orders block generation; energy shortages can be
repaired by additional charging earlier in the horizon.

Suggestion mode solves power in integer market lots, with a five-second limit and
0.1% relative MIP gap. Legacy optimization retains its prior tolerance. Limits
are forecast prices rounded outward by side to a valid price tick, not optimized
auction acceptance thresholds. Execution probability and actual allocation are
not modeled. The fixed-order objective uses minimum terminal reserve and no
continuation value; it does not reactivate legacy risk/scenario settings.

Only additional volume is converted to new Limit orders. The complete proposal
and every selected subset are checked by the existing deterministic simulation
engine. Preview checks never create saved runs. Baseline contribution comparisons
are shown only when that baseline is physically feasible.

## Boundaries and integrity

- `milp_model.py`: shared mathematical model; optional fixed obligations.
- `order_suggestion_service.py`: eligibility, solve, incremental order conversion.
- `order_suggestion_validation.py`: canonical request fingerprint and pure checks.
- `/api/order-suggestions`: generation; `/validate`: exact combined selection.
- `use-order-suggestions.ts`: temporary state, cancellation, stale-response guards.
- `order-suggestions-dialog.tsx`: review and selection, existing dialog semantics.
- `workspace-adapters.ts`: one request serializer for simulation and suggestions.

The stateless validation endpoint validates the supplied combined portfolio; it
does not certify that client-supplied selections originated from a prior solver
response. This is a local draft workflow, not an approval or authorization API.
Unique order IDs, append-once UI guards and request identity checks prevent
accidental repeat acceptance. No generic value-based deduplication is performed:
intentional identical manual orders remain valid. Suggested IDs preserve origin
through the existing saved simulation's submitted orders.

Tests cover both durations, DST days, negative/zero prices, baseline preservation,
power/availability/conflict rejection, reserve repair, subset feasibility, stale
inputs, cancel and duplicate acceptance.

## Compact selection checks

The Check column maps canonical simulation findings to delivery instants and
selected order IDs. A warning opens one inline explanation with the observed
value, battery limit and all eligible orders in that combined batch, including
existing manual orders. It does not attribute the whole violation to one addition.
Unselected rows are neutral. Pending, stale and failed checks never reuse a
previous success indicator.

Because simulation excludes infeasible batches, later executed rows are marked
Recheck until earlier failures are resolved. Portfolio-level and existing-only
issues remain in the compact summary; row issues are counted by interval rather
than repeated as paragraphs. Numeric evidence is captured where the existing
engine evaluates the constraint, not recalculated in the UI.
