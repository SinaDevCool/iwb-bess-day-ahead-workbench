import type { Point as ForecastPoint } from "./workspace-types";
import type { Dispatch, SetStateAction } from "react";
import { clock } from "./workspace-format";
/** These indices refer to the case's UTC delivery grid, including repeated DST hours. */
export function AvailabilityEditor({
  points,
  zone,
  unavailable,
  setUnavailable,
}: {
  points: ForecastPoint[];
  zone: string;
  unavailable: number[];
  setUnavailable: Dispatch<SetStateAction<number[]>>;
}) {
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
            {clock(p.timestamp_utc, zone)} <small>{p.timestamp_utc.slice(11, 16)} UTC</small>
          </label>
        ))}
      </div>
    </details>
  );
}
