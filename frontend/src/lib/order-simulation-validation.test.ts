import { describe, expect, it } from "vitest";
import { priceCondition, validateBattery, validateOrders } from "./order-simulation-validation";

const battery = {
  capacity_mwh: 100,
  max_charge_power_mw: 50,
  max_discharge_power_mw: 50,
  initial_soc_mwh: 50,
  min_soc_mwh: 10,
  max_soc_mwh: 90,
  target_soc_mwh: 50,
  round_trip_efficiency: 0.9,
  degradation_cost_eur_per_mwh: 3,
  max_equivalent_cycles: 1.5,
  grid_limit_mw: 50,
  unavailable_intervals: [],
};
const market = {
  market_name: "Swiss Day-Ahead",
  bidding_zone: "CH",
  currency: "EUR",
  timezone: "Europe/Zurich",
  product_minutes: 60 as const,
  gate_closure_local: "12:00",
  volume_increment_mw: 0.1,
  price_increment_eur_mwh: 0.01,
  min_price_eur_mwh: -500,
  max_price_eur_mwh: 4000,
  exchange_fee_eur_per_mwh: 0,
  exchange_fee_policy: "excluded" as const,
  clearing_fee_eur_per_mwh: 0.015,
  assumptions_unverified: true,
};

describe("order simulation validation", () => {
  it("validates relational battery limits", () => {
    expect(validateBattery(battery)).toEqual({});
    expect(validateBattery({ ...battery, initial_soc_mwh: 95 }).initial_soc_mwh).toContain(
      "inside",
    );
    expect(validateBattery({ ...battery, max_soc_mwh: 110 }).max_soc_mwh).toContain("capacity");
    expect(validateBattery({ ...battery, target_soc_mwh: 5 }).target_soc_mwh).toContain("inside");
  });
  it("validates syntax but leaves physical conflicts to simulation", () => {
    const issues = validateOrders(
      [
        { id: "a", interval: 1, side: "BUY", orderType: "LIMIT", volume: "50.05", limit: "5000" },
        { id: "b", interval: 1, side: "SELL", orderType: "MARKET", volume: "60", limit: "" },
      ],
      market,
      battery,
      24,
    );
    expect(issues["order.a.volume"]).toContain("increments");
    expect(issues["order.a.limit"]).toContain("between");
    expect(issues["order.b.volume"]).toBeUndefined();
    expect(issues["order.a.interval"]).toBeUndefined();
  });
  it("uses side-specific inclusive limit conditions", () => {
    expect(priceCondition("BUY", 50, 50).passed).toBe(true);
    expect(priceCondition("BUY", 51, 50).marginEurMwh).toBe(-1);
    expect(priceCondition("SELL", 51, 50).marginEurMwh).toBe(1);
    expect(priceCondition("SELL", 49, 50).passed).toBe(false);
  });
});
