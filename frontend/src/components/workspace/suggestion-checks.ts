import type { SubmittedOrder } from "@/types/api";

export type SelectionIssue = {
  issue_id: string;
  code: string;
  message: string;
  delivery_start_utc: string | null;
  existing_orders: SubmittedOrder[];
  selected_order_ids: string[];
  observed_value: number | null;
  configured_limit: number | null;
  unit: string | null;
};
export type SelectionCheck = {
  order_id: string;
  execution_status: string;
  reason_code: string;
  issue_ids: string[];
  after_exclusion: boolean;
};
export type SelectionResult = {
  feasible: boolean;
  contribution_eur: number;
  improvement_eur: number | null;
  issues: string[];
  interval_issues?: SelectionIssue[];
  order_checks?: SelectionCheck[];
};
const labels: Record<string, string> = {
  maximum_soc: "SoC limit",
  minimum_soc: "SoC limit",
  power_limit: "Power limit",
  unavailable: "Unavailable",
  cycle_budget: "Cycle limit",
  conflicting_sides: "Conflicting directions",
};
export const checkLabel = (code: string) => labels[code.toLowerCase()] ?? "Check interval";
const number = (value: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
/** Presentation of server evidence only, never a second battery calculation. */
export function issueText(issue: SelectionIssue) {
  const { observed_value: value, configured_limit: limit, unit } = issue;
  if (value == null || limit == null) return issue.message;
  if (issue.code === "terminal_soc")
    return `End reserve not met: ${number(value)} / ${number(limit)} ${unit}.`;
  const boundary = issue.code === "minimum_soc" ? "Minimum" : "Maximum";
  return `Would reach ${number(value)} ${unit} · ${boundary} ${number(limit)} ${unit}`;
}
export function participants(issue: SelectionIssue, suggestions: SubmittedOrder[]) {
  const existing = issue.existing_orders.map((o) => `existing ${o.side} ${number(o.volume_mw)} MW`);
  const selected = suggestions
    .filter((o) => issue.selected_order_ids.includes(o.client_order_id))
    .map((o) => `selected ${o.side} ${number(o.volume_mw)} MW`);
  return `Combined interval check: ${[...existing, ...selected].join(" + ")}.`;
}
