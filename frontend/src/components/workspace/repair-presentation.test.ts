import { expect, it } from "vitest";
import { repairIssueText, repairReason, repairSummary } from "./repair-presentation";
import type { RepairIssue } from "./use-portfolio-repair";

const issue: RepairIssue = {
  code: "conflicting_sides",
  message: "Review corrections to adjust orders.",
  existing_orders: [{ client_order_id: "a" }] as RepairIssue["existing_orders"],
};
it("removes circular instructions and combines reasons without duplicate labels", () => {
  expect(repairIssueText(issue)).not.toContain("Review corrections");
  expect(repairReason([issue, issue, { ...issue, code: "power_limit" }], "a")).toBe(
    "Addresses: conflicting directions and power limit.",
  );
  expect(repairReason([issue], "b")).toBe("Part of the full-day repair.");
});
it("falls back to old evidence and formats every change count", () => {
  expect(repairIssueText({ ...issue, code: "unknown", message: "Saved explanation" })).toBe(
    "Saved explanation",
  );
  expect(
    repairSummary([
      { change: "Removed" },
      { change: "Updated" },
      { change: "Added" },
      { change: "Unchanged" },
      { change: "Unchanged" },
    ]),
  ).toBe("1 order removed · 1 order reduced · 1 order added · 2 orders unchanged");
});
