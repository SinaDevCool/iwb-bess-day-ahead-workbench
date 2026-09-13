"use client";
import { CostEditor } from "./cost-editor";

import { Dialog, DialogActions } from "./dialog";
import { ForecastLoader } from "./forecast-loader";
import { WorkspaceHistory } from "./workspace-history";

import { BatteryEditor } from "./battery-editor";
import { ForecastEditor } from "./forecast-editor";
import type { ReadyWorkbench } from "./use-workbench";
import { ProposalOrderPreview } from "./proposal-order-preview";
import { euro, num } from "./workspace-format";
/** Editors stage changes; only their Apply callbacks mutate the shared draft. */
export function WorkspaceDialogs({
  context,
}: {
  context: Pick<
    ReadyWorkbench,
    | "setConfigurationOpen"
    | "setReviewSettings"
    | "draft"
    | "busy"
    | "error"
    | "modal"
    | "setModal"
    | "preview"
    | "previewCurrent"
    | "risk"
    | "horizon"
    | "confirmation"
    | "setConfirmation"
    | "change"
    | "generate"
    | "apply"
    | "restore"
  >;
}) {
  const {
    draft,
    setConfigurationOpen,
    setReviewSettings,
    busy,
    error,
    modal,
    setModal,
    preview,
    previewCurrent,
    risk,
    horizon,
    confirmation,
    setConfirmation,
    change,
    generate,
    apply,
    restore,
  } = context;
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
              if (prices.some((price, index) => Number(price) !== Number(draft.prices[index])))
                change({ prices });
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {modal === "load-forecast" && (
        <Dialog title="Load Day-Ahead price forecast" close={() => setModal(null)}>
          <ForecastLoader
            key={`${draft.date}-${draft.market.product_minutes}`}
            date={draft.date}
            minutes={draft.market.product_minutes}
            points={draft.points}
            cancel={() => setModal(null)}
            apply={(preview) => {
              change({
                points: preview.points,
                prices: preview.points.map((p) => String(p.price_eur_mwh)),
                forecast: preview.forecast,
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
      {modal === "proposal" && (
        <Dialog title="Generate proposal" close={() => setModal(null)}>
          <p>
            Use the current forecast and battery settings to suggest orders. Your orders are
            unchanged until you apply the proposal.
          </p>
          <p>
            Using {risk.replaceAll("_", " ")} · {horizon.replaceAll("_", " ")}. Proposal settings
            are in the configuration panel.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setModal(null);
              setConfigurationOpen(true);
              setReviewSettings(true);
            }}
          >
            Review proposal settings
          </button>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {preview && (
            <div className="ws-preview">
              <h3>Review proposal</h3>
              {!previewCurrent && (
                <p role="status">Inputs changed. Generate a new preview before replacing orders.</p>
              )}
              <p>
                {preview.orders.length} Limit orders ·{" "}
                {euro(preview.proposal.summary.expected_contribution_eur)} forecast contribution ·
                final SoC {num(preview.proposal.summary.proposal_terminal_soc_mwh)} MWh
              </p>
              <p>{preview.pricing_policy}</p>
              <ProposalOrderPreview orders={preview.orders} market={draft.market} />
              <p>
                Applying replaces all {draft.orders.length} entered orders. You can undo this
                change.
              </p>
            </div>
          )}
          <DialogActions>
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className={preview ? "secondary" : "primary"}
              disabled={Boolean(busy)}
              onClick={() => void generate()}
            >
              {busy ? `${busy}…` : "Generate preview"}
            </button>
            {preview && (
              <button
                className="primary"
                onClick={apply}
                disabled={Boolean(busy) || !previewCurrent}
              >
                Replace orders with proposal
              </button>
            )}
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
