export const num = (n: number, digits = 1) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(n);
export const euro = (n: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
export { intervalTime as clock } from "@/lib/time-presentation";
