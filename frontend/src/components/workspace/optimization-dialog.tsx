"use client";
import { useState } from "react";
import type { Draft } from "./workspace-types";
import type { SubmittedOrder } from "@/types/api";
import { Dialog } from "./dialog";
import { PortfolioRepairPanel } from "./portfolio-repair-panel";
import { OrderSuggestionsDialog } from "./order-suggestions-dialog";
import { replaceable } from "./suggestion-revision";

export function OptimizationDialog({
  draft,
  repairFirst,
  close,
  repair,
  improve,
}: {
  draft: Draft;
  repairFirst: boolean;
  close: () => void;
  repair: (orders: SubmittedOrder[]) => void;
  improve: (orders: SubmittedOrder[]) => void;
}) {
  const [mode, setMode] = useState<"choose" | "repair" | "improve">(
    repairFirst ? "repair" : "choose",
  );
  if (mode === "improve")
    return (
      <OrderSuggestionsDialog
        draft={draft}
        replacing={draft.orders.some(replaceable)}
        close={close}
        add={improve}
        reviewProtected={() => setMode("repair")}
      />
    );
  return (
    <Dialog title={mode === "repair" ? "Repair portfolio" : "Re-optimize"} close={close} wide>
      {mode === "choose" ? (
        <>
          <p>Review a proposal before changing your orders.</p>
          <div className="suggestion-toolbar">
            <button className="secondary" onClick={() => setMode("repair")}>
              Repair portfolio
            </button>
            <button className="primary" onClick={() => setMode("improve")}>
              Improve suggestions
            </button>
          </div>
        </>
      ) : (
        <PortfolioRepairPanel draft={draft} close={close} apply={repair} />
      )}
    </Dialog>
  );
}
