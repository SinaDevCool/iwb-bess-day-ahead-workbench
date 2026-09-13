"use client";
import { useRef, useState } from "react";
import { DialogActions } from "./dialog";
import type { Draft } from "./workspace-types";
/** Transaction cost edits stage only market settings; battery values remain untouched. */
export function CostEditor({
  draft,
  apply,
  cancel,
}: {
  draft: Draft;
  apply: (patch: Partial<Draft>) => void;
  cancel: () => void;
}) {
  const [fee, setFee] = useState(String(draft.market.exchange_fee_eur_per_mwh));
  const [clearing, setClearing] = useState(String(draft.market.clearing_fee_eur_per_mwh));
  const [configured, setConfigured] = useState(draft.market.exchange_fee_policy === "configured");
  const exchangeRef = useRef<HTMLInputElement>(null);
  const clearingRef = useRef<HTMLInputElement>(null);
  const invalidFee = (value: string) =>
    !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0;
  const exchangeInvalid = invalidFee(fee);
  const clearingInvalid = invalidFee(clearing);
  const feesInvalid = exchangeInvalid || clearingInvalid;
  return (
    <>
      <section>
        <label className="ws-check">
          <input
            type="checkbox"
            checked={configured}
            onChange={(e) => setConfigured(e.target.checked)}
          />
          Include confirmed exchange fee
        </label>
        <div className="ws-fields">
          <label>
            Exchange €/MWh
            <input
              ref={exchangeRef}
              name="exchange-fee"
              aria-label="Exchange €/MWh"
              aria-invalid={exchangeInvalid}
              aria-describedby={exchangeInvalid ? "exchange-fee-error" : undefined}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
            {exchangeInvalid && (
              <small id="exchange-fee-error" className="field-error">
                Enter an exchange fee of zero or more.
              </small>
            )}
          </label>
          <label>
            Clearing €/MWh
            <input
              ref={clearingRef}
              name="clearing-fee"
              aria-label="Clearing €/MWh"
              aria-invalid={clearingInvalid}
              aria-describedby={clearingInvalid ? "clearing-fee-error" : undefined}
              inputMode="decimal"
              min="0"
              type="number"
              step="any"
              value={clearing}
              onChange={(e) => setClearing(e.target.value)}
            />
            {clearingInvalid && (
              <small id="clearing-fee-error" className="field-error">
                Enter a clearing fee of zero or more.
              </small>
            )}
          </label>
        </div>
        <p>
          Fees apply to executed grid energy on both sides. Confirm tariff assumptions with IWB.
        </p>
      </section>
      <DialogActions>
        <span>Apply to draft · re-simulate to update results</span>
        <button className="secondary" onClick={cancel}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={feesInvalid}
          onClick={() =>
            apply({
              market: {
                ...draft.market,
                exchange_fee_eur_per_mwh: Number(fee),
                exchange_fee_policy: configured ? "configured" : "excluded",
                clearing_fee_eur_per_mwh: Number(clearing),
              },
            })
          }
        >
          Apply settings
        </button>
      </DialogActions>
      {feesInvalid && (
        <p role="alert" className="field-error">
          Transaction fees must be non-negative finite values.{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => (exchangeInvalid ? exchangeRef : clearingRef).current?.focus()}
          >
            Review invalid fees
          </button>
        </p>
      )}
    </>
  );
}
