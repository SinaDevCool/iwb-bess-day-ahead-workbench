import type { Battery, Market, Simulation } from "@/types/api";

export type ConfigurationItem = { key: string; group: "Market" | "Strategy" | "Battery" | "Availability"; label: string; value: string };

const number = (value: number, digits = 1) => new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
const words = (value?: string) => (value ?? "Not recorded").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatForecastLabel = (value: string) => ({
  "Expected forecast": "Central DA forecast",
  "Downside": "Lower-price DA forecast",
  "Upside": "Higher-price DA forecast",
  "Peak compression": "Compressed-peak DA forecast",
}[value] ?? value);

export function runLabel(run: Simulation) {
  const time = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(run.created_at_utc));
  return `${formatForecastLabel(run.scenario_name)} · ${run.market.product_minutes} min · ${time}`;
}

export const runDisplayName = (run: Pick<Simulation, "simulation_id" | "display_name">) =>
  run.display_name?.trim() || `Saved run ${run.simulation_id.replace("sim-", "").slice(0, 8)}`;

export const comparisonKey = (index: number) => String.fromCharCode(65 + index);

const signatureLabels: Record<string, string> = {
  scenario: "Forecast", product: "Product", risk: "Posture", horizon: "Energy policy",
  terminal_value: "Terminal value", charge_limit: "Charge", discharge_limit: "Discharge",
  grid_limit: "Grid", terminal_soc: "Reserve", soc_envelope: "SoC window",
  efficiency: "Efficiency", degradation: "Degradation", cycles: "Cycles", availability: "Availability",
};

export function configurationSignature(reference: Simulation, current: Simulation, limit = 2) {
  if (reference.simulation_id === current.simulation_id) return "Comparison reference";
  const differences = configurationDiff(reference, current);
  if (!differences.length) return "Same inputs as reference";
  const summary = differences.slice(0, limit).map((item) => `${signatureLabels[item.key] ?? item.label}: ${item.value}`).join(" · ");
  return differences.length > limit ? `${summary} · +${differences.length - limit} more` : summary;
}

export function configurationItems(run: Simulation): ConfigurationItem[] {
  const battery: Battery = run.battery;
  const market: Market = run.market;
  return [
    { key: "scenario", group: "Market", label: "Optimization forecast", value: formatForecastLabel(run.scenario_name) },
    { key: "delivery", group: "Market", label: "Delivery date", value: run.delivery_date },
    { key: "product", group: "Market", label: "Product duration", value: `${market.product_minutes} min` },
    { key: "exchange_fee", group: "Market", label: "Exchange fee", value: `${number(market.exchange_fee_eur_per_mwh, 3)} €/MWh` },
    { key: "clearing_fee", group: "Market", label: "Clearing fee", value: `${number(market.clearing_fee_eur_per_mwh, 3)} €/MWh` },
    { key: "risk", group: "Strategy", label: "Decision posture", value: words(run.risk_posture) },
    { key: "horizon", group: "Strategy", label: "End-of-day policy", value: words(run.horizon_policy) },
    { key: "terminal_value", group: "Strategy", label: "Terminal energy value", value: `${number(run.terminal_value_eur_per_mwh ?? 0)} €/MWh` },
    { key: "capacity", group: "Battery", label: "Energy capacity", value: `${number(battery.capacity_mwh)} MWh` },
    { key: "charge_limit", group: "Battery", label: "Charge limit", value: `${number(battery.max_charge_power_mw)} MW` },
    { key: "discharge_limit", group: "Battery", label: "Discharge limit", value: `${number(battery.max_discharge_power_mw)} MW` },
    { key: "grid_limit", group: "Battery", label: "Grid connection", value: `${number(battery.grid_limit_mw)} MW` },
    { key: "initial_soc", group: "Battery", label: "Initial SoC", value: `${number(battery.initial_soc_mwh)} MWh` },
    { key: "terminal_soc", group: "Battery", label: "Minimum end-of-day SoC", value: `${number(battery.target_soc_mwh)} MWh` },
    { key: "soc_envelope", group: "Battery", label: "SoC envelope", value: `${number(battery.min_soc_mwh)}–${number(battery.max_soc_mwh)} MWh` },
    { key: "efficiency", group: "Battery", label: "Round-trip efficiency", value: `${number(battery.round_trip_efficiency * 100, 0)}%` },
    { key: "degradation", group: "Battery", label: "Degradation cost", value: `${number(battery.degradation_cost_eur_per_mwh)} €/MWh` },
    { key: "cycles", group: "Battery", label: "Daily cycle budget", value: `${number(battery.max_equivalent_cycles, 2)} EFC` },
    { key: "availability", group: "Availability", label: "Unavailable intervals", value: battery.unavailable_intervals.length ? battery.unavailable_intervals.join(", ") : "None" },
  ];
}

export function configurationDiff(reference: Simulation, current: Simulation) {
  const referenceItems = new Map(configurationItems(reference).map((item) => [item.key, item]));
  return configurationItems(current).filter((item) => referenceItems.get(item.key)?.value !== item.value).map((item) => ({ ...item, before: referenceItems.get(item.key)?.value ?? "Not recorded" }));
}
