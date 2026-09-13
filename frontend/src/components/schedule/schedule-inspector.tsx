import type { Battery, Dispatch, SimulatedOrderResult } from "@/types/api";
import { projectIntervals } from "@/lib/interval-evidence";
import { IntervalOrderEvidence } from "./interval-order-evidence";
import { clock, euros, exact, number } from "./chart-config";
import type { useScheduleInspection } from "./use-schedule-inspection";
/** Read-only evidence for the shared selected interval, never a second calculation. */
export function ScheduleInspector({
  inspection,
  rows,
  battery,
  dt,
  zone,
  orderResults,
  selectedOrderId,
  onSelectOrder,
  onEditOrder,
  onShowDetails,
}: {
  inspection: ReturnType<typeof useScheduleInspection>;
  rows: Dispatch[];
  battery: Battery;
  dt: number;
  zone: string;
  orderResults?: SimulatedOrderResult[];
  selectedOrderId?: string;
  onSelectOrder?: (id: string) => void;
  onEditOrder?: (id: string) => void;
  onShowDetails?: () => void;
}) {
  const { active, activeIndex, pinned, setPinned } = inspection;
  const evidence = projectIntervals(rows, battery, dt / 60000, orderResults)[activeIndex];
  const intervalOrders = evidence?.orders ?? [];
  const orderCount = intervalOrders.length;
  return (
    <div
      className="schedule-inspector"
      tabIndex={0}
      role="group"
      aria-label="Interval inspector. Use left and right arrow keys to navigate, Escape to unpin."
      onKeyDown={inspection.onKeyDown}
    >
      {active && pinned ? (
        <>
          <div className="schedule-inspector-heading">
            <strong aria-live={pinned ? "polite" : "off"}>
              {exact(Date.parse(active.timestamp_utc), zone)}–
              {clock(Date.parse(active.timestamp_utc) + dt, zone)} {pinned ? "· pinned" : ""}
            </strong>
            <div className="schedule-inspector-actions">
              <button
                type="button"
                className="ws-text-button"
                aria-label="Previous interval"
                disabled={activeIndex <= 0}
                onClick={() => {
                  inspection.inspect(activeIndex - 1);
                  setPinned(true);
                }}
              >
                ←
              </button>
              <button
                type="button"
                className="ws-text-button"
                aria-label="Next interval"
                disabled={activeIndex >= rows.length - 1}
                onClick={() => {
                  inspection.inspect(activeIndex + 1);
                  setPinned(true);
                }}
              >
                →
              </button>
              {onShowDetails && (
                <button type="button" className="ws-text-button" onClick={onShowDetails}>
                  Interval details
                </button>
              )}
            </div>
          </div>
          <div className="schedule-inspector-values">
            <span>DA {euros(active.price_eur_mwh)}/MWh</span>
            <span>
              {active.action} · {number(Math.abs(active.power_mw), 1)} MW
            </span>
            <span>
              SoC {number(evidence.socBefore)} → {number(active.soc_mwh)} MWh
            </span>
            <span>Contribution {euros(active.interval_pnl_eur)}</span>
            {orderResults && (
              <span>
                {orderCount} {orderCount === 1 ? "order" : "orders"}
              </span>
            )}
            <button
              className="ws-text-button"
              aria-pressed={pinned}
              onClick={() => {
                if (!pinned) inspection.inspect(activeIndex);
                setPinned(!pinned);
              }}
            >
              {pinned ? "Unpin" : "Pin interval"}
            </button>
          </div>
          {orderResults && (
            <IntervalOrderEvidence
              orders={intervalOrders}
              selectedId={selectedOrderId}
              onSelect={onSelectOrder}
              onEdit={onEditOrder}
            />
          )}
        </>
      ) : (
        <div className="schedule-inspector-idle">
          <span>
            Move across any chart to see synchronized values. Click to pin and inspect orders.
          </span>
          <button
            type="button"
            className="ws-text-button"
            aria-pressed={false}
            disabled={!active}
            onClick={() => {
              inspection.inspect(activeIndex);
              setPinned(true);
            }}
          >
            Pin interval
          </button>
          {onShowDetails && (
            <button type="button" className="ws-text-button" onClick={onShowDetails}>
              Interval details
            </button>
          )}
        </div>
      )}
    </div>
  );
}
