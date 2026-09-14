import type { RepairIssue } from "./use-portfolio-repair";
import type { RevisionRow } from "./suggestion-revision";
import { checkLabel } from "./suggestion-checks";

export function repairIssueText(issue: RepairIssue) {
  if (issue.code === "conflicting_sides")
    return "BUY and SELL both qualify. This simulation does not net opposing trades.";
  if (
    issue.code === "power_limit" &&
    issue.observed_value != null &&
    issue.configured_limit != null
  ) {
    const number = (n: number) =>
      new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
    return `${issue.side ? `${issue.side} volume` : "Volume"} ${number(issue.observed_value)} MW exceeds the ${number(issue.configured_limit)} MW limit.`;
  }
  return issue.message;
}

export function repairReason(issues: RepairIssue[], id: string) {
  const labels = [
    ...new Set(
      issues
        .filter((i) => i.existing_orders.some((o) => o.client_order_id === id))
        .map((i) => checkLabel(i.code).toLowerCase()),
    ),
  ];
  return labels.length ? `Addresses: ${labels.join(" and ")}.` : "Part of the full-day repair.";
}

export function repairSummary(rows: RevisionRow[]) {
  const labels = { Removed: "removed", Updated: "reduced", Added: "added", Unchanged: "unchanged" };
  return (Object.keys(labels) as (keyof typeof labels)[])
    .flatMap((key) => {
      const count = rows.filter((r) => r.change === key).length;
      return count ? [`${count} ${count === 1 ? "order" : "orders"} ${labels[key]}`] : [];
    })
    .join(" · ");
}
