import type { Dispatch, SimulatedOrderResult } from "@/types/api";
import { exact } from "./chart-config";
/** The strip shares plot gutters: each button belongs to one delivery interval. */
export function OrderOutcomeStrip({
  rows,
  orders,
  selectedInterval,
  zone,
  onSelect,
}: {
  rows: Dispatch[];
  orders: SimulatedOrderResult[];
  selectedInterval?: string;
  zone: string;
  onSelect: (index: number, id: string) => void;
}) {
  return (
    <div className="schedule-outcomes">
      <div className="schedule-outcome-legend">
        Order outcomes <span>● Executed</span>
        <span>○ Price not met</span>
        <span>△ Physical constraint</span>
      </div>
      <div
        className="schedule-outcome-grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))` }}
      >
        {rows.map((row, index) => {
          const matches = orders.filter(
            (o) =>
              Date.parse(o.submitted_order.delivery_start_utc) === Date.parse(row.timestamp_utc),
          );
          if (!matches.length) return <span key={row.timestamp_utc} />;
          const rejected = matches.some((o) => o.execution_status === "PHYSICALLY_INFEASIBLE");
          const executed = matches.every((o) => o.execution_status === "EXECUTED");
          const label =
            exact(Date.parse(row.timestamp_utc), zone) +
            " · " +
            matches.length +
            " orders · " +
            matches.map((o) => o.execution_status.replaceAll("_", " ").toLowerCase()).join(", ");
          return (
            <button
              type="button"
              key={row.timestamp_utc}
              title={label}
              aria-label={label}
              className={rejected ? "constraint" : executed ? "executed" : "not-executed"}
              aria-pressed={new Date(row.timestamp_utc).toISOString() === selectedInterval}
              onClick={() => onSelect(index, matches[0].submitted_order.client_order_id)}
            >
              {rejected ? "△" : executed ? "●" : "○"}
              {matches.length > 1 && <sup>{matches.length}</sup>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
