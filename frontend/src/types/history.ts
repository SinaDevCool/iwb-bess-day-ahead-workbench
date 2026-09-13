import type { OrderSimulation, Simulation } from "./api";
export type HistoryDetail = {
  run: OrderSimulation | Simulation;
  events: {
    event_id: number;
    created_at: string;
    event_type: string;
    payload: Record<string, unknown>;
  }[];
};
export type HistoryEntry = {
  simulation_id: string;
  run_type: string;
  created_at_utc: string;
  delivery_date: string;
  validation_status: string;
  contribution_eur: number;
  source_proposal_id?: string;
  display_name?: string;
};
