import type { Draft } from "./workspace-types";
import { requestBody } from "./workspace-adapters";

/** Only optimizer inputs invalidate a preview; editing entered orders does not. */
export function proposalKey(
  draft: Draft,
  policy: {
    risk: string;
    horizon: string;
    terminal: string;
    weights: string[];
    lookahead: string;
  },
) {
  // The transport converts numeric strings; validity must also preserve blanks.
  return JSON.stringify({ ...requestBody(draft), price_values: draft.prices, policy });
}
