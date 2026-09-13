"use client";
import { intervalAtTime } from "@/lib/interval-evidence";
import type { Dispatch } from "@/types/api";
import { useMemo, useState } from "react";
import { Y_AXIS_WIDTH, margin } from "./chart-config";

/** Transient inspection never writes navigation state. Click/Enter opens interval details. */
export function useScheduleInspection(
  rows: Dispatch[],
  start: number,
  end: number,
  dt: number,
  selectedInterval?: string,
  onSelectInterval?: (id: string) => void,
  onShowDetails?: () => void,
) {
  const [hover, setHover] = useState<{ index: number; fraction: number; anchor?: string }>();
  const [dismissed, setDismissed] = useState(false);
  const timestamps = useMemo(() => rows.map((row) => Date.parse(row.timestamp_utc)), [rows]);
  const current = hover?.anchor === selectedInterval ? hover : undefined;
  const activeIndex = dismissed
    ? -1
    : (current?.index ??
      rows.findIndex((row) => new Date(row.timestamp_utc).toISOString() === selectedInterval));
  const active = rows[activeIndex];
  const fraction = current?.fraction ?? (activeIndex + 0.5) / Math.max(rows.length, 1);
  const inspect = (index: number, position = (index + 0.5) / Math.max(rows.length, 1)) => {
    if (!rows[index]) return;
    setDismissed(false);
    setHover({ index, fraction: position, anchor: selectedInterval });
  };
  const atPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotWidth = bounds.width - Y_AXIS_WIDTH - margin.right;
    const position = (event.clientX - bounds.left - Y_AXIS_WIDTH) / plotWidth;
    if (plotWidth <= 0 || position < 0 || position > 1) return undefined;
    const index = intervalAtTime(
      timestamps,
      dt,
      Math.min(end - 1, start + position * (end - start)),
    );
    return index < 0 ? undefined : { index, position };
  };
  const open = (index: number) => {
    if (!rows[index]) return;
    onSelectInterval?.(new Date(rows[index].timestamp_utc).toISOString());
    onShowDetails?.();
  };
  const trackEvents = {
    tabIndex: 0,
    onFocus: () => {
      if (activeIndex < 0) inspect(0);
    },
    onBlur: () => {
      setHover(undefined);
      setDismissed(true);
    },
    onPointerLeave: () => {
      setHover(undefined);
      setDismissed(true);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      // Moving over the overlay keeps it readable instead of chasing its own box.
      if ((event.target as Element).closest?.('[role="tooltip"]')) return;
      if (event.pointerType === "touch") return;
      const point = atPointer(event);
      if (point) inspect(point.index, point.position);
    },
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      if ((event.target as Element).closest?.('[role="tooltip"]')) return;
      const point = atPointer(event);
      if (point) {
        inspect(point.index, point.position);
        open(point.index);
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? rows.length - 1
              : activeIndex < 0
                ? 0
                : activeIndex + (event.key === "ArrowRight" ? 1 : -1);
        inspect(Math.max(0, Math.min(rows.length - 1, next)));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        open(activeIndex);
      }
      if (event.key === "Escape") {
        setHover(undefined);
        setDismissed(true);
      }
    },
  };
  return { active, activeIndex, fraction, trackEvents };
}
