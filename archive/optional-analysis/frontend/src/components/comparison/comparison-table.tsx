import { useDisplayTimezone } from "../workspace/time-preference";
import {
  comparisonKey,
  configurationSignature,
  formatForecastLabel,
  runDisplayName,
} from "@/lib/comparison";
import type { ComparisonMetric, Simulation } from "@/types/api";
import {
  formatMetric,
  formatRunTime,
  metricValue,
  money,
  outcomeValue,
  probabilityLabel,
  shortId,
  signedMetric,
  words,
} from "./comparison-format";
export function ComparisonTable({
  runs,
  metric,
  referenceId,
  focusedId,
  onFocus,
}: {
  runs: Simulation[];
  metric: ComparisonMetric;
  referenceId: string;
  focusedId?: string;
  onFocus: (id: string) => void;
}) {
  const zone = useDisplayTimezone();
  const reference = runs.find((run) => run.simulation_id === referenceId) ?? runs[0];
  return (
    <div className="table-scroll comparison-results-table">
      <table>
        <caption className="sr-only">Accessible comparison of selected simulation runs</caption>
        <thead>
          <tr>
            <th>Saved Run</th>
            {metric === "contribution" ? (
              <>
                <th>
                  Lower-Price Outcome<small>Net contribution</small>
                </th>
                <th>
                  Central-Price Outcome<small>Net contribution</small>
                </th>
                <th>
                  Higher-Price Outcome<small>Net contribution</small>
                </th>
                <th>
                  Probability-Weighted<small>Using saved probabilities</small>
                </th>
              </>
            ) : (
              <th>{words(metric)}</th>
            )}
            <th>Change vs Reference</th>
            <th>Validation</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const value = metricValue(run, metric);
            const referenceValue = metricValue(reference, metric);
            return (
              <tr
                className={run.simulation_id === focusedId ? "active" : ""}
                aria-current={run.simulation_id === focusedId ? "true" : undefined}
                key={run.simulation_id}
                tabIndex={0}
                onClick={() => onFocus(run.simulation_id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFocus(run.simulation_id);
                  }
                }}
              >
                <td>
                  <div className="run-title">
                    <i className="run-key">{comparisonKey(index)}</i>
                    <strong>{runDisplayName(run)}</strong>
                    {run.simulation_id === referenceId && <b>Reference</b>}
                  </div>
                  <small>
                    {formatForecastLabel(run.scenario_name)} ·{" "}
                    {formatRunTime(run.created_at_utc, zone)} · {shortId(run.simulation_id)}
                  </small>
                  <small>{configurationSignature(reference, run)}</small>
                  {metric === "contribution" && <small>{probabilityLabel(run)}</small>}
                </td>
                {metric === "contribution" ? (
                  <>
                    <td>{money(outcomeValue(run, "Downside"))}</td>
                    <td>{money(outcomeValue(run, "Expected"))}</td>
                    <td>{money(outcomeValue(run, "Upside"))}</td>
                    <td>
                      <strong>
                        {money(
                          run.risk?.expected_contribution_eur ??
                            run.summary.expected_contribution_eur,
                        )}
                      </strong>
                    </td>
                  </>
                ) : (
                  <td>{formatMetric(value, metric)}</td>
                )}
                <td>
                  {run.simulation_id === referenceId
                    ? "Reference"
                    : signedMetric(value - referenceValue, metric)}
                </td>
                <td>
                  <span className={`validation-pill ${run.validation.status}`}>
                    {run.validation.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
