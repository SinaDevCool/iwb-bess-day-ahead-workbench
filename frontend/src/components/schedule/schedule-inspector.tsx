import type { Battery, Dispatch, SimulatedOrderResult } from "@/types/api";
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
}: {
  inspection: ReturnType<typeof useScheduleInspection>;
  rows: Dispatch[];
  battery: Battery;
  dt: number;
  zone: string;
  orderResults?: SimulatedOrderResult[];
}) {
  const { active, activeIndex, pinned, setPinned } = inspection;
  const orderCount =
    orderResults?.filter(
      (o) =>
        Date.parse(o.submitted_order.delivery_start_utc) ===
        Date.parse(active?.timestamp_utc ?? ""),
    ).length ?? 0;
  return (
    <div
      className="schedule-inspector"
      tabIndex={0}
      role="group"
      aria-label="Interval inspector. Use left and right arrow keys to navigate, Escape to unpin."
      onKeyDown={inspection.onKeyDown}
    >
      {active ? (
        <>
          <strong>
            {exact(Date.parse(active.timestamp_utc), zone)}–
            {clock(Date.parse(active.timestamp_utc) + dt, zone)} {pinned ? "· pinned" : ""}
          </strong>
          <span>DA {euros(active.price_eur_mwh)}/MWh</span>
          <span>
            {active.action} · {number(Math.abs(active.power_mw), 1)} MW
          </span>
          <span>
            SoC {number(activeIndex ? rows[activeIndex - 1].soc_mwh : battery.initial_soc_mwh)} →{" "}
            {number(active.soc_mwh)} MWh
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
              setPinned((value) => !value);
            }}
          >
            {pinned ? "Unpin" : "Pin interval"}
          </button>
        </>
      ) : (
        <span>
          Hover any track or focus here and use arrow keys to inspect an interval. Click a track to
          pin.
        </span>
      )}
    </div>
  );
}
