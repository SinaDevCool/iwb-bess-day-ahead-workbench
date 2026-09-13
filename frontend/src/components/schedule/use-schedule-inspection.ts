"use client";
import { intervalAtTime } from "@/lib/interval-evidence";
import type { Dispatch } from "@/types/api";
import { useState } from "react";
import { Y_AXIS_WIDTH, margin } from "./chart-config";
/** One inspection state drives every track. Explicit pinning wins over hover. */
export function useScheduleInspection(
  rows: Dispatch[],
  start: number,
  end: number,
  dt: number,
  selectedInterval?: string,
  onSelectInterval?: (id: string) => void,
) {
  const [hovered, setHovered] = useState<number>();
  const [pinned, setPinned] = useState(false);
  const activeIndex =
    hovered ?? rows.findIndex((r) => new Date(r.timestamp_utc).toISOString() === selectedInterval);
  const active = rows[activeIndex];
  const inspect = (index: number) => {
    if (!rows[index]) return;
    setHovered(index);
    onSelectInterval?.(new Date(rows[index].timestamp_utc).toISOString());
  };
  const indexAtPointer = (
    event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction =
      (event.clientX - bounds.left - Y_AXIS_WIDTH) / (bounds.width - Y_AXIS_WIDTH - margin.right);
    return intervalAtTime(
      rows.map((r) => Date.parse(r.timestamp_utc)),
      dt,
      start + fraction * (end - start),
    );
  };
  const trackEvents = {
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (pinned || event.pointerType === "touch") return;
      const index = indexAtPointer(event);
      if (index >= 0) inspect(index);
    },
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      const index = indexAtPointer(event);
      if (index >= 0) {
        inspect(index);
        setPinned(true);
      }
    },
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      inspect(
        Math.max(
          0,
          Math.min(
            rows.length - 1,
            activeIndex < 0 ? 0 : activeIndex + (e.key === "ArrowRight" ? 1 : -1),
          ),
        ),
      );
      setPinned(true);
    }
    if (e.key === "Escape") {
      setPinned(false);
      setHovered(undefined);
    }
  };
  return { active, activeIndex, inspect, pinned, setPinned, trackEvents, onKeyDown };
}
