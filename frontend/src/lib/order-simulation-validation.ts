import type { Battery, Market } from "@/types/api";

export type DraftOrderInput = {
  id: string;
  interval: number;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  volume: string;
  limit: string;
  origin?: "manual" | "suggested";
  protected?: boolean;
  generationId?: string;
};
export type FieldIssues = Record<string, string>;

const aligned = (value: number, increment: number) =>
  Math.abs(value / increment - Math.round(value / increment)) < 1e-7;

export function validateBattery(battery: Battery): FieldIssues {
  const issues: FieldIssues = {};
  for (const [key, value] of Object.entries(battery))
    if (typeof value === "number" && !Number.isFinite(value))
      issues[key] = "Enter a finite number.";
  if (battery.capacity_mwh <= 0) issues.capacity_mwh = "Energy capacity must be positive.";
  if (battery.min_soc_mwh < 0) issues.min_soc_mwh = "Minimum SoC cannot be negative.";
  if (battery.max_soc_mwh > battery.capacity_mwh)
    issues.max_soc_mwh = "Maximum SoC cannot exceed energy capacity.";
  if (battery.min_soc_mwh >= battery.max_soc_mwh)
    issues.min_soc_mwh = "Minimum SoC must be below maximum SoC.";
  if (
    battery.initial_soc_mwh < battery.min_soc_mwh ||
    battery.initial_soc_mwh > battery.max_soc_mwh
  )
    issues.initial_soc_mwh = "Initial SoC must be inside the configured SoC window.";
  if (battery.target_soc_mwh < battery.min_soc_mwh || battery.target_soc_mwh > battery.max_soc_mwh)
    issues.target_soc_mwh = "End reserve must be inside the configured SoC window.";
  if (battery.max_charge_power_mw <= 0)
    issues.max_charge_power_mw = "Charge power must be positive.";
  if (battery.max_discharge_power_mw <= 0)
    issues.max_discharge_power_mw = "Discharge power must be positive.";
  if (battery.grid_limit_mw <= 0) issues.grid_limit_mw = "Grid limit must be positive.";
  if (battery.round_trip_efficiency <= 0 || battery.round_trip_efficiency > 1)
    issues.round_trip_efficiency = "Efficiency must be greater than 0% and at most 100%.";
  if (battery.max_equivalent_cycles <= 0)
    issues.max_equivalent_cycles = "Cycle budget must be positive.";
  if (battery.degradation_cost_eur_per_mwh < 0)
    issues.degradation_cost_eur_per_mwh = "Degradation cost cannot be negative.";
  return issues;
}

export function validateOrders(
  orders: DraftOrderInput[],
  market: Market,
  battery: Battery,
  intervalCount: number,
): FieldIssues {
  const issues: FieldIssues = {};
  void battery; // Physical limits are evaluated by the simulation, not input syntax.
  for (const order of orders) {
    const volume = Number(order.volume);
    const prefix = `order.${order.id}`;
    if (!Number.isFinite(volume) || volume <= 0)
      issues[`${prefix}.volume`] = "Enter a positive volume.";
    else if (!aligned(volume, market.volume_increment_mw))
      issues[`${prefix}.volume`] = `Use ${market.volume_increment_mw} MW increments.`;
    if (!Number.isInteger(order.interval) || order.interval < 0 || order.interval >= intervalCount)
      issues[`${prefix}.interval`] = "Choose a valid delivery interval.";
    if (order.orderType === "LIMIT") {
      const limit = Number(order.limit);
      if (order.limit.trim() === "" || !Number.isFinite(limit))
        issues[`${prefix}.limit`] = "Enter a valid limit price.";
      else if (limit < market.min_price_eur_mwh || limit > market.max_price_eur_mwh)
        issues[`${prefix}.limit`] =
          `Price must be between ${market.min_price_eur_mwh} and ${market.max_price_eur_mwh} €/MWh.`;
      else if (!aligned(limit, market.price_increment_eur_mwh))
        issues[`${prefix}.limit`] = `Use ${market.price_increment_eur_mwh} €/MWh increments.`;
    }
  }
  // Physical conflicts are simulation outcomes, not malformed inputs.
  return issues;
}

export function priceCondition(side: "BUY" | "SELL", forecast: number, limit: number) {
  const marginEurMwh = side === "BUY" ? limit - forecast : forecast - limit;
  return {
    operator: side === "BUY" ? ("≤" as const) : ("≥" as const),
    // Match Python's inclusive comparison exactly; input tick validation is separate.
    passed: side === "BUY" ? forecast <= limit : forecast >= limit,
    atLimit: forecast === limit,
    marginEurMwh,
  };
}
