import type { Draft } from "./workspace-types";
import type { DraftOrderInput } from "@/lib/order-simulation-validation";
import type { SubmittedOrder } from "@/types/api";
import { calculationIdentity, fromOrders } from "./workspace-adapters";

/** Unknown/legacy provenance is always protected. Never infer origin from an ID. */
export const replaceable = (o: DraftOrderInput) =>
  o.origin === "suggested" && o.protected === false;
export const suggestionIdentity = (draft: Draft) =>
  JSON.stringify({
    calculation: calculationIdentity(draft),
    protection: draft.orders.map((o) => [o.id, o.origin ?? "manual", o.protected ?? true]),
  });
export const revisionBaseline = (draft: Draft) => ({
  ...draft,
  orders: draft.orders.filter((o) => !replaceable(o)),
});
const values = (o: DraftOrderInput) =>
  JSON.stringify([
    o.interval,
    o.side,
    o.orderType,
    Number(o.volume),
    o.orderType === "LIMIT" ? Number(o.limit) : null,
  ]);

export type RevisionRow = {
  before?: DraftOrderInput;
  after?: DraftOrderInput;
  change: "Added" | "Removed" | "Updated" | "Unchanged";
};
/** Match exact orders first, then unambiguous interval/side pairs; never merge quantities. */
export function revisionRows(old: DraftOrderInput[], next: DraftOrderInput[]): RevisionRow[] {
  const remaining = [...next];
  const rows: RevisionRow[] = [];
  const unmatched = old.filter((before) => {
    const i = remaining.findIndex((after) => values(after) === values(before));
    if (i < 0) return true;
    rows.push({ before, after: remaining.splice(i, 1)[0], change: "Unchanged" });
    return false;
  });
  for (const before of unmatched) {
    const matches = remaining.filter(
      (after) => after.interval === before.interval && after.side === before.side,
    );
    const oldMatches = unmatched.filter(
      (o) => o.interval === before.interval && o.side === before.side,
    );
    if (matches.length === 1 && oldMatches.length === 1) {
      const after = matches[0];
      remaining.splice(remaining.indexOf(after), 1);
      rows.push({ before, after, change: "Updated" });
    } else rows.push({ before, change: "Removed" });
  }
  rows.push(...remaining.map((after) => ({ after, change: "Added" as const })));
  return rows.sort((a, b) => (a.after ?? a.before)!.interval - (b.after ?? b.before)!.interval);
}

export function applySuggestions(
  draft: Draft,
  orders: SubmittedOrder[],
  replacing: boolean,
): Draft {
  const generationId = orders[0]?.generation_id ?? crypto.randomUUID();
  const incoming = fromOrders(orders, draft.points).map((o) => ({
    ...o,
    origin: "suggested" as const,
    protected: false,
    generationId,
  }));
  const rows = revisionRows(replacing ? draft.orders.filter(replaceable) : [], incoming);
  const proposed = rows.flatMap((row) =>
    row.after
      ? [{ ...row.after, id: row.change === "Unchanged" ? row.before!.id : row.after.id }]
      : [],
  );
  const next = {
    ...draft,
    orders: [...(replacing ? revisionBaseline(draft).orders : draft.orders), ...proposed],
  };
  if (new Set(next.orders.map((o) => o.id)).size !== next.orders.length)
    throw new Error("Duplicate order identities. Generate suggestions again.");
  return { ...next, suggestionIdentity: suggestionIdentity(next) };
}
