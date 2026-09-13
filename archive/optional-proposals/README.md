# Optional optimizer UI archive

The active task is manual Market/Limit order entry, forecast entry and simulation of the resulting battery schedule. Generate proposal and proposal-only settings were removed from the active UI. Fresh sessions start with an empty order list. Saved drafts are preserved; example orders are loaded only through the explicit Load example inputs action.

This directory preserves the removed proposal components, action hook, cache-key utility and tests, plus pre-removal integration snapshots at their original relative paths. It is outside the frontend build. Restore selected modules and merge their navigation/state integration rather than overwriting newer application files. The backend optimizer remains available and tested for future reuse.

Calculation distinction: the former Generate proposal action called `/api/proposal-preview`, which runs optimization. Simulate orders calls `/api/order-simulations`, which deterministically evaluates entered orders and their battery feasibility. It does not generate new orders or run MILP. No clearing or optimization mathematics were changed by this UI simplification.
