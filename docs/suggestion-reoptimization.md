# Suggestion revisions

Suggest orders and Re-optimize suggestions use the same suggestion endpoint and MILP.
The latter sends only protected orders as its baseline, then replaces the entire unlocked
suggestion set after final validation. Simulation still evaluates exact entered quantities.

Manual and legacy orders are protected by default. Suggested orders carry explicit origin,
protection and generation metadata; editing their values protects them automatically. Metadata
round-trips through submitted-order snapshots but does not affect simulation freshness.
Protection does affect suggestion preview freshness. Never infer provenance from ID prefixes.

The revision table matches exact orders first, then unambiguous interval/side pairs. It never
nets or merges quantities. Acceptance preserves protected IDs and unchanged suggestion IDs;
Undo restores the full prior draft. Empty validated revisions may remove all unlocked suggestions.
Stale previews, failed validation and repeated acceptance cannot modify the draft.

Date and resolution changes retain protection. Coarsening refuses inconsistent metadata across
quarters rather than discarding protection. Old history without metadata restores protected.
MILP infeasibility, timeout and other solver failures are reported separately; none relax orders.

Tests cover replacement partitioning, provenance, freshness, empty revisions, legitimate multiple
orders per interval, 15/60-minute manual-charge revision, existing DST solver cases and full-fill
simulation compatibility.
