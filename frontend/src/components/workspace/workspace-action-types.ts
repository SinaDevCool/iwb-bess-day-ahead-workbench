import type { WorkspaceState } from "./workspace-state";
import type { Draft, View } from "./workspace-types";
export type ActionContext = WorkspaceState & {
  dirty: boolean;
  navigate: (view: View) => void;
  change: (patch: Partial<Draft>) => void;
  validate: (includeOrders?: boolean) => boolean;
};
