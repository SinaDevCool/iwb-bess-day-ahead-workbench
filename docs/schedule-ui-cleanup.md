# Schedule presentation cleanup

The schedule overview now prioritizes the forecast, battery power, stored energy and interval contribution. Technical engine text, duplicate execution counts, forecast disclosure and long visible chart instructions were removed from this view. Essential feasibility warnings and chart units remain; simulation calculations are unchanged.

## Component ownership

- `simulation-results.tsx` composes the result views and concise verdict.
- `dispatch-chart.tsx` supplies one inspected interval to all four tracks.
- `schedule/track-readout.tsx` renders typed tooltip fields and boundary-aware placement.
- `interval-table/order-details.tsx` shows shared interval energy once, followed by labelled order outcomes. Idle intervals remain inspectable.
- `app/unified/interval-details.css` owns the expanded-detail presentation and constrains mobile grid sizing.

## Regression coverage

Chart interaction tests cover synchronized values, keyboard inspection and dismissal. Tooltip tests cover plot-edge placement, explicit energy boundary labels and empty state. Interval-table tests cover expanded order evidence, closing details, idle rows and column preferences.

Browser checks included a real four-order simulation, chart inspection, executed and idle interval details, and 390px/1440px layouts. The mobile table scrolls internally instead of expanding the page. Backend optimization and order-clearing contracts were not modified.
