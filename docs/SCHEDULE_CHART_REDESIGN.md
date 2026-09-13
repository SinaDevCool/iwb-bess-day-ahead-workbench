# Battery schedule chart redesign

## Scope and ownership

The existing schedule remains the single visualization of the saved simulation.
No optimizer, settlement calculation, execution rule, API or database schema changes.
The existing daily economics bridge and interval table remain authoritative companions.

- `lib/interval-evidence.ts`: shared chronological projection; backend values are not recalculated.
- `lib/schedule-chart-data.ts`: interval-centred signed power and boundary-based stored energy.
- `components/dispatch-chart.tsx`: composition, explicit market duration/timezone, shared geometry.
- `components/schedule/*-track.tsx`: one small component per unit-specific track.
- `use-schedule-inspection.ts`: transient hover versus committed selection and keyboard pinning.
- `order-outcome-strip.tsx` and `interval-order-evidence.tsx`: grouped order discovery and backend reasons.
- `app/unified/schedule.css`: schedule-specific styling; obsolete order-locator CSS removed.

## Interaction contract

All tracks share time bounds and gutters. Power and contribution each use one signed
bar series, avoiding Recharts' side-by-side offsets for positive/negative series.
Forecast prices are stepwise; energy joins interval boundaries under constant interval
power. The end reserve is a final-time marker, not an all-day minimum.

Hover is local and does not update the working-case selection. Clicking or keyboard
navigation commits an interval. External selections take precedence; a new result
remounts the chart. Selected order evidence links to the existing editor, which remains
disabled for stale results. The detail button opens the existing interval table.

Market orders have no limit segment. A selected Limit order shows a short horizontal
segment only over its own delivery interval. Outcomes retain backend explanations;
an orderless interval is explicitly distinguished from rejected orders.

## Validation performed

- Frontend regression suite, TypeScript, ESLint, structure guard and production build.
- Backend regression suite: 168 tests, no backend changes.
- Added coverage for single-interval 15-minute geometry, DST UTC identity, transient
  hover, external selection, pinning, detail navigation, negative limits, mixed order
  outcomes and multi-order selection.
- Local browser: Market and Limit marker selection, exact interval inspector,
  chart-to-table navigation and chart-to-existing-editor navigation.
- Actual SVG geometry: power and contribution bar centres match; shared cursor
  aligns within one CSS pixel (subpixel rounding). Limit segment spans one interval.
- Responsive browser checks at 390, 1280 and 1920 CSS pixels: no document overflow.
  Viewport override reset after testing.

## Manual regression recipe

1. Enter Market and Limit BUY/SELL orders and simulate.
2. Select a marker, inspect backend outcome, then open its existing order editor.
3. Test a price-rejected order and a physically infeasible order; distinguish from
   an interval without orders. Multiple orders remain individually selectable.
4. Inspect each track and compare power/contribution centres with the cursor.
5. Pin, navigate with arrow keys, unpin, and open Interval Detail.
6. Repeat with 15-minute products, negative/flat prices, outages and asymmetric
   effective power limits. Check the final reserve marker and boundary SoC.
7. Re-simulate or restore another result; confirm no stale pinned order survives.

This is a deterministic order simulation, not a model of real auction allocation,
partial filling or exchange clearing probability.
