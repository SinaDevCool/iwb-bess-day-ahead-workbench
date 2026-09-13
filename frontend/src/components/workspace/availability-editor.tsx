import type { Point as ForecastPoint } from "./workspace-types";
import type { Dispatch, SetStateAction } from "react";
import { intervalTime } from "@/lib/time-presentation";
import { useDisplayTimezone } from "./time-preference";
/** These indices refer to the case's UTC delivery grid, including repeated DST hours. */
export function AvailabilityEditor({
  points,
  unavailable,
  setUnavailable,
}: {
  points: ForecastPoint[];
  unavailable: number[];
  setUnavailable: Dispatch<SetStateAction<number[]>>;
}) {
  const zone = useDisplayTimezone();
  return (
    <details>
      <summary>Availability</summary>
      <p>Selected intervals are unavailable. No dispatch is permitted.</p>
      <div className="ws-availability">
        {points.map((p, i) => (
          <label key={p.timestamp_utc}>
            <input
              type="checkbox"
              checked={unavailable.includes(i)}
              onChange={() =>
                setUnavailable((x) => (x.includes(i) ? x.filter((n) => n !== i) : [...x, i]))
              }
            />
            {intervalTime(p.timestamp_utc, zone)}
          </label>
        ))}
      </div>
    </details>
  );
}
