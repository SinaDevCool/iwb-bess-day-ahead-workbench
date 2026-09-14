# Portfolio repair

Re-optimize is the shared entry point for economic suggestion improvements and minimal
portfolio corrections. Repair previews never persist runs or modify the draft. The existing
simulation engine evaluates the final candidate before Apply, which creates a single Undo
snapshot and makes the previous simulation stale. Simulation remains a separate action.

## Permissions

Manual and legacy orders remain protected. Explicit preview-scoped permissions allow quantity
reductions or removal, not changing time, side, order type, price or provenance. Unlocked
suggestions are flexible by default. Keep original overrides either permission. Price-ineligible
orders remain unchanged. New balancing limit orders require the additions permission.
The fingerprint covers the complete baseline and permissions. Final validation rechecks scope,
unique identities, lot/tick alignment and complete-portfolio feasibility.

## Optimization

The repair formulation extends the existing battery MILP matrix with retained order quantities,
change indicators and balancing additions. It does not duplicate or relax physical constraints.
Four lexicographic passes minimize changed manual orders, total changed/added orders, changed
grid energy, and finally economic cost. The overall solve budget is 20 seconds; a timeout is
not called infeasibility, and no incomplete result is applied. Minimality is relative to this
permission scope: no shifting orders, repricing, increasing existing quantities or changing
configuration. Future broader trading policies must be explicit.

## Diagnosis

Existing simulation evidence supplies power, availability, conflicting sides, minimum/maximum
energy, cycles and terminal-reserve findings. Unsupported calculation findings are technical
errors, not order repair targets. Invalid inputs use existing field validation before solving.
Price rejection and negative contribution alone do not trigger repair. Protected-order review
shows candidates, not a claimed irreducible conflict set. Full-day optimization can alter an
earlier permitted order to resolve a later failure; interval evidence is not causal attribution.

## Review

The shared revision table retains original IDs and exposes before/after quantities, provenance,
and issue context. Keep original invalidates the preview and requires recalculation. The full
validated plan is applied atomically; individual dependent corrections cannot be accepted as
though independent. Balancing additions can be disabled and recalculated. Existing snapshots
without provenance remain protected. No database migration is required.
