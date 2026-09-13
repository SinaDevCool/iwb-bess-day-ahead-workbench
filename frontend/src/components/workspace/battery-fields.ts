import type { Battery } from "@/types/api";
type NumericBatteryField = Exclude<keyof Battery, "unavailable_intervals">;
export const BATTERY_FIELDS: [NumericBatteryField, string, string][] = [
  ["capacity_mwh", "Energy capacity", "MWh"],
  ["max_charge_power_mw", "Charge limit", "MW"],
  ["max_discharge_power_mw", "Discharge limit", "MW"],
  ["grid_limit_mw", "Grid limit", "MW"],
  ["initial_soc_mwh", "Initial SoC", "MWh"],
  ["min_soc_mwh", "Minimum SoC", "MWh"],
  ["max_soc_mwh", "Maximum SoC", "MWh"],
  ["target_soc_mwh", "End reserve", "MWh"],
  ["round_trip_efficiency", "Round-trip efficiency", "ratio 0–1"],
  ["max_equivalent_cycles", "Cycle budget", "EFC"],
  ["degradation_cost_eur_per_mwh", "Degradation cost", "€/battery MWh"],
];
