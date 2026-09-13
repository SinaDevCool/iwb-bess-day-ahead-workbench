import type { ApiIssue } from "@/lib/api";
export function ForecastIssues({ message, issues }: { message: string; issues: ApiIssue[] }) {
  if (!message) return null;
  const list = (items: ApiIssue[]) => (
    <ul>
      {items.map((issue, index) => (
        <li key={index}>
          {issue.row != null ? `Row ${issue.row} · ` : ""}
          {issue.message}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="forecast-issues" role="alert">
      <strong>{message}</strong>
      <p>Your current forecast has not changed.</p>
      {list(issues.slice(0, 3))}
      {issues.length > 3 && (
        <details>
          <summary>Show all {issues.length} issues</summary>
          {list(issues)}
        </details>
      )}
    </section>
  );
}
