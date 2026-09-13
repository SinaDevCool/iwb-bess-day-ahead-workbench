"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { readPreference, writePreference } from "@/lib/session-preferences";
import { deadlineTime, type DisplayTimezone } from "@/lib/time-presentation";
import type { Draft } from "./workspace-types";

const TimeContext = createContext<{
  zone: DisplayTimezone;
  changeZone: (zone: DisplayTimezone) => void;
}>({
  zone: "Europe/Zurich",
  changeZone: () => {},
});
/** Kept outside the financial draft and snapshot identity on purpose. */
export function TimePreference({ children }: { children: React.ReactNode }) {
  const [zone, setZone] = useState<DisplayTimezone>("Europe/Zurich");
  useEffect(() => {
    const timer = setTimeout(() => {
      if (readPreference("display-timezone") === "UTC") setZone("UTC");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const changeZone = (next: DisplayTimezone) => {
    setZone(next);
    writePreference("display-timezone", next);
  };
  return <TimeContext.Provider value={{ zone, changeZone }}>{children}</TimeContext.Provider>;
}
export const useDisplayTimezone = () => useContext(TimeContext).zone;
/** Display conversion never edits the configured market-local deadline. */
export function MarketDeadline({ draft }: { draft: Draft }) {
  const zone = useDisplayTimezone();
  return (
    <>
      {deadlineTime(draft.points, draft.market.gate_closure_local, draft.market.timezone, zone)} on
      the preceding day
    </>
  );
}
export function TimezoneSelector() {
  const { zone, changeZone } = useContext(TimeContext);
  return (
    <label className="timezone-selector">
      Time zone
      <select
        name="display-timezone"
        value={zone}
        onChange={(e) => changeZone(e.target.value as DisplayTimezone)}
      >
        <option value="Europe/Zurich">Zurich · CET/CEST</option>
        <option value="UTC">UTC</option>
      </select>
    </label>
  );
}
