# Delivery-date order preservation

Changing the date previously cleared every order. Applying a replacement forecast then produced a valid idle schedule with zero submitted orders, which looked like a broken chart.

The date transition now preserves order IDs, side, type, MW and limit, remapping interval indexes using market-local delivery times. It clears the old forecast, date-specific availability and proposal reference. Confirmation and Undo remain available. Missing or differently repeated daylight-saving slots reject the transition without changing the draft. Display timezone does not affect this mapping.

An empty order list now produces an actionable message in Auction Orders instead of submitting an idle simulation. Forecast input alone still does not generate orders or invoke MILP.

Verification: automated preservation and DST tests for 15/60 minutes; date-change/Undo and empty-order UI tests; real browser sequences with new-date forecasts returned 4/4 hourly orders and 16/16 quarter-hour orders, both with nonzero battery throughput. The quarter-hour browser check crossed from summer to winter offset.
