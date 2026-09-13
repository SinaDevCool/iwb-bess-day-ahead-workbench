"use client";
import { X } from "lucide-react";
import type { ReadyWorkbench } from "./use-workbench";
import { ConfigurationMarket, ConfigurationBattery } from "./configuration-input-sections";

/** Only inputs consumed by order simulation appear in the active configuration. */
export function ConfigurationPanel({
  context,
}: {
  context: Pick<
    ReadyWorkbench,
    | "draft"
    | "busy"
    | "setModal"
    | "configurationOpen"
    | "setConfigurationOpen"
    | "priceIssues"
    | "changeDate"
  >;
}) {
  const { configurationOpen, setConfigurationOpen } = context;
  return (
    <aside className="uw-config" aria-label="Shared case configuration" hidden={!configurationOpen}>
      <div className="ws-section-head">
        <h2>Case configuration</h2>
        <button
          className="icon-button"
          aria-label="Collapse configuration"
          onClick={() => setConfigurationOpen(false)}
        >
          <X size={16} />
        </button>
      </div>
      <ConfigurationMarket context={context} />
      <ConfigurationBattery context={context} />
    </aside>
  );
}
