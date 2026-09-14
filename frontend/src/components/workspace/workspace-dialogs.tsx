"use client";
import { CostEditor } from "./cost-editor";

import { Dialog, DialogActions } from "./dialog";
import { ForecastLoader } from "./forecast-loader";
import { WorkspaceHistory } from "./workspace-history";

import { BatteryEditor } from "./battery-editor";
import { ForecastEditor } from "./forecast-editor";
import type { ReadyWorkbench } from "./use-workbench";
/** Editors stage changes; only their Apply callbacks mutate the shared draft. */
export function WorkspaceDialogs({
  context,
}: {
  context: Pick<
    ReadyWorkbench,
    | "draft"
    | "busy"
    | "modal"
    | "setModal"
    | "confirmation"
    | "setConfirmation"
    | "change"
    | "restore"
    | "setUndo"
  >;
}) {
  const { draft, busy, modal, setModal, confirmation, setConfirmation, change, restore, setUndo } =
    context;
  const SettingsEditor = modal === "costs" ? CostEditor : BatteryEditor;
  return (
    <>
      {modal === "history" && (
        <Dialog title="Saved history" close={() => setModal(null)}>
          <WorkspaceHistory restore={restore} busy={Boolean(busy)} />
        </Dialog>
      )}
      {confirmation && (
        <Dialog title="Confirm input replacement" close={() => setConfirmation(undefined)}>
          <p>{confirmation.message}</p>
          <DialogActions>
            <button className="secondary" onClick={() => setConfirmation(undefined)}>
              Cancel replacement
            </button>
            <button
              className="primary"
              onClick={() => {
                const action = confirmation.action;
                setConfirmation(undefined);
                action();
              }}
            >
              Confirm replacement
            </button>
          </DialogActions>
        </Dialog>
      )}
      {modal === "forecast" && (
        <Dialog wide title="Edit Day-Ahead prices" close={() => setModal(null)}>
          <ForecastEditor
            draft={draft}
            cancel={() => setModal(null)}
            apply={(prices) => {
              if (
                prices.some(
                  (price, index) =>
                    !draft.prices[index]?.trim() || Number(price) !== Number(draft.prices[index]),
                )
              ) {
                setUndo(draft);
                change({ prices });
              }
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {modal === "load-forecast" && (
        <Dialog title="Replace price forecast" close={() => setModal(null)} wide>
          <ForecastLoader
            key={`${draft.date}-${draft.market.product_minutes}`}
            date={draft.date}
            minutes={draft.market.product_minutes}
            points={draft.points}
            currentForecast={draft.forecast}
            cancel={() => setModal(null)}
            apply={(preview) => {
              setUndo(draft);
              change({
                points: preview.points,
                prices: preview.points.map((p) => String(p.price_eur_mwh)),
                forecast: { ...preview.forecast, updated_at_utc: new Date().toISOString() },
              });
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {(modal === "battery" || modal === "costs") && (
        <Dialog
          title={modal === "costs" ? "Transaction costs" : "Battery settings"}
          close={() => setModal(null)}
        >
          <SettingsEditor
            draft={draft}
            cancel={() => setModal(null)}
            apply={(patch) => {
              change(patch);
              setModal(null);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
