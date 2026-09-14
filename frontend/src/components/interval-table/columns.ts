export const choices = {
  forecast: "DA forecast (€/MWh)",
  action: "Action",
  power: "Power (MW)",
  soc: "End stored energy (MWh)",
  net: "Net contribution (€)",
  energy: "Executed grid energy (MWh)",
  revenue: "Sales (€)",
  purchases: "Purchases (€)",
  fees: "Fees (€)",
  degradation: "Degradation (€)",
};
export type Column = keyof typeof choices;
/** Headers and cells must share alignment, including user-selected columns. */
export const alignment = (column: Column) => (column === "action" ? "" : "numeric");
export const defaults: Column[] = ["forecast", "action", "power", "soc", "net"];
export const n = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
export { intervalTime as clock } from "@/lib/time-presentation";
