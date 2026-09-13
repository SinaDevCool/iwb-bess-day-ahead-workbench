# Post-refactor UI validation — 13 September 2026

## Scope

Local Next.js UI on port 3100 against the refactored Python backend on port 8100.
This is a functional and visual regression review, not a live exchange certification.
Existing repository changes were preserved; this review did not commit, push or deploy.

## Browser coverage and observed results

| Area | Checks and evidence |
| --- | --- |
| Auction Orders | Open/edit existing Market and Limit orders; BUY limit changed from 40 to 31 against a forecast of 32; negative volume blocked; restoring volume clears the input issue. Market orders display no price condition. |
| Execution | Hourly baseline: four executed orders, €1,825.26 contribution, 56.325 MWh final SoC. The missed BUY produces three executed orders, €2,522.48 contribution, and a correctly flagged 37.351 MWh reserve shortfall. A higher cash result is not presented as a feasible portfolio. |
| Date/duration | Changing to 15 minutes prompts before replacing forecast/orders, preserves battery settings, exposes Undo and creates 96 forecast intervals. |
| Forecast editor | Blank prices block Apply and focus review finds the invalid field; zero is accepted. Changes remain staged until Apply. |
| Forecast import | Uploaded the repository's 24-hour mock CSV through the real file chooser and backend; preview validated 24/24 and applied. The same file under 15-minute configuration is rejected with a 96-interval requirement. Malformed pasted CSV rejects non-numeric prices and cannot be applied. |
| Forecast providers | Demo preview validates 24 intervals without applying automatically. Volue and Montel are visibly not connected and disabled; no fallback is presented as live provider data. |
| Battery settings | Invalid minimum SoC above maximum blocks Apply with related initial/reserve messages. Reset requires its explicit staged confirmation. Availability can be selected per interval. Cancel preserves the original draft. |
| Quarter-hour workflow | Generated and applied 27 Limit orders, then simulated them: 27/27 executed, €6,350.42 contribution, about 50.018 MWh final SoC, physically feasible. |
| Outage propagation | Marked the 06:00 quarter-hour unavailable. Simulation rejects the unavailable order and dependent infeasible orders (23/27 execute), while correctly distinguishing executed-schedule feasibility from submitted-portfolio feasibility. |
| Dispatch & Economics | Overview and Interval Detail navigation; shared chart keyboard inspector pins a timestamp and displays price, power, start/end SoC and contribution. Four synchronized tracks retain units and minimum/maximum SoC labels. Daily economics reconciles to the headline result. |
| Interval table | Expanded the 06:00 order evidence; deselected Action and selected Fees; table headers update and the maximum column count is respected; Reset restores recommended columns. |
| Physical Validation | Issue, headroom and all-check states correspond to the result. Baseline charge headroom is 30 MW (20 used / 50 allowed), not always Fully used. Evidence expansion and empty-filter behavior reviewed. |
| Compare Runs | Both order-simulation and optimizer-proposal views load. Contribution/Battery Usage displays, selected-run configuration and reference differences reviewed. Sensitivity calculation returns all five operating levers for the quarter-hour proposal. |
| History | Run detail Summary, Inputs and Activity display the immutable snapshot; Restore simulation returns the original 24-price, four-order baseline and €1,825.26 result. |
| Overview route | Reviewed `/present`; corrected stale workflow copy to match manual orders, optional optimization, simulation and unified History. |
| Responsive | Visual inspection at 390×844, 768×1024, 1366×768 and 1920×1080. No page-level horizontal overflow in measured mobile/tablet states; wide tables and navigation intentionally have contained scrolling. Temporary viewport override reset after testing. |

## Defects fixed

1. **Overlapping narrow-screen order editor.** Legacy named grid areas conflicted with the unified two-column grid. The unified editor now owns child placement; full-width desktop fields also stop inheriting the old sidebar spans. Verified geometrically and visually in the browser.
2. **Duplicate invalid-volume text.** Show one actionable error, retaining MWh helper text for valid inputs.
3. **Transaction-fee feedback/accessibility.** Added field names, explicit invalid state, associated inline explanations and a styled Review action that focuses the first invalid fee. Negative and blank values still cannot be applied.
4. **Ambiguous proposal-policy errors.** Identify the actual invalid probability, terminal value or lookahead setting; explain where to correct it. Changing policy clears the stale error/preview.
5. **Validation explanation too far from its trigger.** Evidence now opens immediately below the selected constraint and is connected with `aria-controls`. Filtering it out hides the explanation.
6. **Framework scroll warning.** Declared the existing smooth-scroll behavior on the root element for Next.js route handling.
7. **Stale overview copy.** Replaced Decision Log/Trader approval wording and the optimizer-only sequence. Removed the claim that every possible physical constraint is validated.

## Regression gates

- Backend: **139 tests passed**.
- Frontend: **58 tests passed across 17 files**, including regressions for duplicate volume feedback, accessible fee errors, policy validation and inline constraint evidence.
- TypeScript, ESLint, Prettier, production build and structure/import checks executed.
- Source-size guard: 187 production files, largest 286 lines; 49 stylesheets checked for unique, acyclic imports.
- No backend financial/optimization behavior was changed by these UI fixes.

## Limits and retained state

This exercises the principal controls and representative valid/invalid workflows in every main workbench tab. It is not an exhaustive Cartesian test of all prices, policies, browser engines, DST dates, uploads or network failures. Automated tests cover additional domain boundaries; real provider credentials and live trading are outside this demo's scope. Download-template output and every saved-run pagination/rename combination were not re-exercised in this browser pass.

The original four-order simulation was restored. Additional local validation simulations and the quarter-hour proposal remain in history as audit evidence; existing records were not removed.
