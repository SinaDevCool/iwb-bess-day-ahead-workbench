export const choices = {
  forecast: "DA forecast (€/MWh)",
  action: "Action",
  power: "Power (MW)",
  soc: "End SoC (MWh)",
  net: "Net contribution (€)",
  energy: "Executed grid energy (MWh)",
  revenue: "Sales (€)",
  purchases: "Purchases (€)",
  fees: "Fees (€)",
  degradation: "Degradation (€)",
};
export type Column = keyof typeof choices;
export const defaults: Column[] = ["forecast", "action", "power", "soc", "net"];
export const n = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
export { intervalTime as clock } from "@/lib/time-presentation";
