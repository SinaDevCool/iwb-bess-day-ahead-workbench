# Archived optional analysis pages

Physical Validation and Compare Runs were removed from the active workbench to focus on entering orders, entering the Day-Ahead forecast and displaying the simulated battery schedule.

## Contents and restoration

- `frontend/` preserves the original page-specific components, comparison hooks, tests and comparison styles at their original relative paths.
- `integration-before/frontend/` preserves the navigation, composition, history and state integration before removal. These are reference snapshots, not files to overwrite wholesale.
- Baseline commit: `655001fc89dd4dc20f2e146980551d86907403be`.

To restore: move the desired page modules back to their original paths, reconcile their shared imports with current APIs, restore the relevant navigation/state and stylesheet integration, and re-enable the archived tests. Then run frontend tests, type checking, lint, structure checks and the production build. Do not replace newer application state code with these snapshots without merging it.

This folder is outside the frontend project and is not part of its build or test discovery. Shared history, data models, backend endpoints and physical safety checks remain active. No saved records or backend validation logic were deleted. Legacy Physical Validation links fall back to the schedule; Compare Runs links fall back to Auction Orders. History retains proposal details but no longer opens the archived comparison screen.
