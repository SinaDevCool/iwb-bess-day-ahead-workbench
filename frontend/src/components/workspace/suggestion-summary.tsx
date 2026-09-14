import { deliveryTime } from "@/lib/time-presentation";
import { useDisplayTimezone } from "./time-preference";
import { issueText, type SelectionResult } from "./suggestion-checks";

/** Row issues live in the table; only unanchored exceptions repeat in the summary. */
export function SuggestionSummary({
  result,
  minutes,
  stale,
  failed,
}: {
  result?: SelectionResult;
  minutes: number;
  stale: boolean;
  failed: boolean;
}) {
  const zone = useDisplayTimezone();
  const money = (value: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(value);
  const issues = result?.interval_issues ?? [];
  const count = new Set(
    issues.filter((i) => i.selected_order_ids.length).map((i) => i.delivery_start_utc),
  ).size;
  return (
    <section className="suggestion-summary" aria-live="polite">
      {stale || failed ? (
        <p>Selection checks unavailable.</p>
      ) : !result ? (
        <p>Checking selection…</p>
      ) : result.feasible ? (
        <p>
          Combined contribution <strong>{money(result.contribution_eur)}</strong>
          {result.improvement_eur !== null
            ? ` · Change ${money(result.improvement_eur)}`
            : " · Restores baseline feasibility"}
        </p>
      ) : (
        <>
          {count > 0 && (
            <p>
              {count} {count === 1 ? "interval needs" : "intervals need"} attention. Check the
              highlighted rows.
            </p>
          )}
          {issues
            .filter((i) => !i.selected_order_ids.length)
            .map((issue) => (
              <p key={issue.issue_id}>
                {issue.delivery_start_utc
                  ? `Existing order at ${deliveryTime(issue.delivery_start_utc, minutes, zone)}: `
                  : ""}
                {issueText(issue)}
              </p>
            ))}
          {!issues.length && <p>{result.issues.join(" ") || "Selection needs attention."}</p>}
          {result.order_checks?.some((c) => c.after_exclusion) && (
            <p>Recheck: later intervals depend on resolving earlier failures.</p>
          )}
        </>
      )}
    </section>
  );
}
