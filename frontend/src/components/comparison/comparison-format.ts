import type { ComparisonMetric, Simulation } from "@/types/api";
export const MAX_RUNS = 4;
export const COLORS = { downside: "#7b8e8c", expected: "#16867f", upside: "#e67d11" };
export const money = (value: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
export const number = (value: number, digits = 1) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(value);
export const shortId = (id: string) => id.replace("sim-", "").slice(0, 8);
export const words = (value?: string) =>
  (value ?? "not recorded").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const metricValue = (run: Simulation, metric: ComparisonMetric) =>
  metric === "contribution"
    ? (run.risk?.expected_contribution_eur ?? run.summary.expected_contribution_eur)
    : metric === "throughput"
      ? run.summary.throughput_mwh
      : metric === "cycles"
        ? run.summary.equivalent_cycles
        : run.summary.order_count;
export const outcomeValue = (run: Simulation, name: "Downside" | "Expected" | "Upside") =>
  run.risk?.outcomes.find((outcome) => outcome.name === name)?.contribution_eur ??
  (name === "Downside"
    ? run.risk?.downside_contribution_eur
    : name === "Upside"
      ? run.risk?.upside_contribution_eur
      : run.summary.expected_contribution_eur) ??
  run.summary.expected_contribution_eur;
export const outcomeLegend = (value: string) =>
  ({
    lowerPrice: "Lower-price outcome",
    centralPrice: "Central-price outcome",
    higherPrice: "Higher-price outcome",
  })[value] ?? words(value);
export const probabilityLabel = (run: Simulation) => {
  const probabilities = run.scenario_probabilities ?? { downside: 0.2, expected: 0.6, upside: 0.2 };
  return `Weights: ${number(probabilities.downside * 100, 0)}% lower · ${number(probabilities.expected * 100, 0)}% central · ${number(probabilities.upside * 100, 0)}% higher`;
};
export const formatMetric = (value: number, metric: ComparisonMetric) =>
  metric === "contribution"
    ? money(value)
    : `${number(value, metric === "cycles" ? 2 : 1)}${metric === "throughput" ? " MWh" : metric === "cycles" ? " EFC" : ""}`;
export const signedMetric = (value: number, metric: ComparisonMetric) =>
  Math.abs(value) < 1e-9 ? "–" : `${value > 0 ? "+" : "−"}${formatMetric(Math.abs(value), metric)}`;
export const formatRunTime = (value: string) =>
  new Intl.DateTimeFormat("en-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  }).format(new Date(value));
export const axisMoney = (value: number) =>
  `${value < 0 ? "−" : ""}€${Math.abs(value) >= 1000 ? `${number(Math.abs(value) / 1000, 1)}k` : number(Math.abs(value), 0)}`;
