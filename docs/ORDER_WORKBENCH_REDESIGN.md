# Order workbench redesign

## Ownership

- `configuration-panel.tsx` presents the shared case, not a second input model.
- `orders-view.tsx` coordinates selection, removal and undo.
- `orders-table.tsx` presents orders and saved simulation statuses.
- `order-ticket.tsx` composes editable fields, current price evidence and saved outcomes.
- `order-price-evidence.tsx` uses the existing shared price-condition calculation.
- `use-order-layout.ts` chooses one docked or inline ticket using available width.
- `unified/order-ticket.css` owns the replacement order table and ticket styling.
- `simulation-presentation.ts` centralizes verdicts across result views.

The ticket never simulates locally. Edits update the case draft and invalidate saved
outcomes. The backend remains authoritative for physical feasibility and settlement.

## Interaction rules

Forecast loading/replacement and interval editing are separate, aligned actions.
Proposal generation is secondary to entering and simulating orders. At wide widths
the ticket is docked; on laptops it appears immediately below its selected row.
There is only one mounted editor. Closing restores row focus; removal focuses Add
order and remains recoverable with Undo. Current price eligibility is not presented
as proof of physical feasibility or actual auction allocation.

## Verification

- Backend regression suite: 168 passing tests.
- Frontend suite: 85 passing tests, including exact price boundaries, stale results,
  Market/Limit changes, physical rejection evidence and delivery-time offsets.
- Browser: CSV upload validated 24 intervals; proposal produced 8 orders; simulation
  executed 8/8 with EUR 6,201.25 contribution and 50 MWh final stored energy.
- Browser: oversized 80 MW order rejected against a 50 MW limit with explicit reason.
- Browser: remove/undo, close-focus restoration, price/type/volume edits and stale labels.
- Responsive checks: 390, 1280, 1440 and 1920 pixel widths; one editor and no page overflow.
- Shared price-boundary fixture is included in Docker's frontend build context.

See `ORDER_SIMULATION_POLICIES.md` for modelling assumptions and exclusions.
