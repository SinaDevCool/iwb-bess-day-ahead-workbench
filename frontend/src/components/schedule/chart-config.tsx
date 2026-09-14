import { CartesianGrid } from "recharts";
/** Geometry is shared by all tracks and pointer hit-testing. */
export const Y_AXIS_WIDTH = 60;
export const margin = { top: 12, right: 24, bottom: 0, left: 0 };
export { timeText as clock, intervalTime as exact } from "@/lib/time-presentation";
export const axis = { fontSize: 12, fill: "#526b70", fontVariantNumeric: "tabular-nums" };
export const chartColors = {
  negative: "#b45443",
  positive: "#237451",
  price: "#174b56",
  soc: "#655fb4",
  grid: "#d5dfdd",
  zero: "#647d79",
  limit: "#7d9295",
  socLimit: "#8980be",
};
// Color each metric by its own sign: charging can earn money at negative prices.
export const signedColor = (value: number) =>
  value < 0 ? chartColors.negative : chartColors.positive;
export const number = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
export const euros = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
export function timeTicks(start: number, end: number, width = 650) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const step = (width >= 850 ? 2 : width >= 500 ? 4 : 8) * 3600000;
  const ticks = Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => start + i * step);
  // Avoid crowding the final boundary on 23/25-hour delivery days.
  if (ticks.length > 1 && end - ticks[ticks.length - 1] < step / 2) ticks.pop();
  return [...ticks, end];
}
export const grid = (
  <CartesianGrid stroke={chartColors.grid} strokeDasharray="2 4" vertical syncWithTicks />
);
