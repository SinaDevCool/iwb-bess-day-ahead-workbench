import { CartesianGrid } from "recharts";
/** Geometry is shared by all tracks and pointer hit-testing. */
export const Y_AXIS_WIDTH = 60;
export const margin = { top: 12, right: 24, bottom: 0, left: 0 };
export const clock = (v: number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
export const exact = (v: number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(v));
export const axis = { fontSize: 12, fill: "#526b70" };
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
export const timeTicks = (start: number, end: number) => [
  ...Array.from({ length: Math.ceil((end - start) / 14400000) }, (_, i) => start + i * 14400000),
  end,
];
export const grid = <CartesianGrid stroke="#e3ebe9" strokeDasharray="2 4" vertical={false} />;
