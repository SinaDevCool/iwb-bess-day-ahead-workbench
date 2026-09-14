"use client";

import { api } from "@/lib/api";
import type { Battery, Market, OrderSimulation } from "@/types/api";

import type { ActionContext } from "./workspace-action-types";
import { examples, fromOrders, identity, calculationIdentity } from "./workspace-adapters";
import { changeResolution } from "./workspace-duration-transition";
import { ordersForDate } from "./workspace-date-transition";
import type { Draft, Point } from "./workspace-types";
type ReplacementActionContext = Pick<
  ActionContext,
  | "draft"
  | "setDraft"
  | "setResult"
  | "setResultKey"
  | "setSelected"
  | "busy"
  | "setBusy"
  | "setError"
  | "setNotice"
  | "setModal"
  | "setUndo"
  | "setConfirmation"
  | "draftRef"
  | "dirty"
  | "navigate"
  | "change"
>;
/** replacement actions preserve explicit snapshots; they never recompute financial results in the UI. */
export function useReplacementActions(context: ReplacementActionContext) {
  const {
    draft,
    setDraft,
    setResult,
    setResultKey,
    setSelected,
    busy,
    setBusy,
    setError,
    setNotice,
    setModal,
    setUndo,
    setConfirmation,
    draftRef,
    dirty,
    navigate,
    change,
  } = context;
  const load = async () => {
    setBusy("Loading");
    setError("");
    try {
      const [configuration, forecast] = await Promise.all([
        api<{ battery: Battery; market: Market }>("/api/configuration"),
        api<{ points: Point[] }>("/api/forecast?delivery_date=2026-09-09"),
      ]);
      setDraft({
        date: "2026-09-09",
        ...configuration,
        points: forecast.points,
        prices: forecast.points.map((p) => String(p.price_eur_mwh)),
        orders: [],
        forecast: {
          source_type: "illustrative",
          source_name: "Illustrative Day-Ahead example",
          version: "illustrative-v1",
          updated_at_utc: new Date().toISOString(),
          bidding_zone: configuration.market.bidding_zone,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load inputs");
    } finally {
      setBusy("");
    }
  };
  const changeDate = async (
    value: string,
    confirmed = false,
    minutes = draft?.market.product_minutes ?? 60,
  ) => {
    if (!draft || !value || (value === draft.date && minutes === draft.market.product_minutes))
      return;
    if (!confirmed) {
      setConfirmation({
        message:
          value === draft.date
            ? "Convert product duration without re-optimizing? Hourly orders split into four quarter-hours at the same MW and price, preserving energy. Quarters merge only when their prices, orders and availability match. Use Re-optimize afterwards for new suggestions, or Simulate battery dispatch to evaluate the converted orders. You can undo this change."
            : "Move existing orders to the same market delivery times on the new date? Forecast and interval availability will be cleared; other battery settings are preserved. Load a new forecast and re-simulate. You can undo this change.",
        action: () => void changeDate(value, true, minutes),
      });
      return;
    }
    const originalKey = identity(draft);
    setBusy("Loading date");
    try {
      const next = await api<{ points: Point[] }>(
        `/api/delivery-grid?delivery_date=${value}&product_minutes=${minutes}`,
      );
      if (!draftRef.current || identity(draftRef.current) !== originalKey)
        throw new Error("Inputs changed while loading. Change the date again to retry.");
      if (value === draft.date) {
        const replacement = changeResolution(draft, next.points, minutes);
        setUndo(draft);
        change(replacement);
        setSelected("");
        setNotice(
          "Product duration converted—not re-optimized. Use Re-optimize → Improve suggestions to calculate new quantities for this product, or Simulate battery dispatch to evaluate the converted orders. Splitting hourly prices does not create a new quarter-hour forecast.",
        );
        return;
      }
      const orders = ordersForDate(draft, next.points);
      setUndo(draft);
      change({
        date: value,
        market: { ...draft.market, product_minutes: minutes },
        points: next.points,
        prices: next.points.map(() => ""),
        forecast: {
          source_type: "manual",
          source_name: "Forecast required",
          version: "pending",
          bidding_zone: draft.market.bidding_zone,
        },
        orders,
        battery: { ...draft.battery, unavailable_intervals: [] },
        sourceProposalId: undefined,
      });
      setSelected("");
      setNotice(
        "Delivery date changed. Orders preserved at their market delivery times. Load the new date's forecast and simulate again.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const restore = async (runId: string, kind: string, confirmed = false) => {
    if (busy) return;
    if (kind === "ORDER_SIMULATION" && draft && dirty && !confirmed) {
      setConfirmation({
        message:
          "Replace the current inputs with this saved snapshot? You can undo the replacement.",
        action: () => void restore(runId, kind, true),
      });
      return;
    }
    const originalKey = draft ? identity(draft) : "";
    setBusy("Restoring");
    try {
      if (kind === "ORDER_SIMULATION") {
        const r = await api<OrderSimulation>(`/api/order-simulations/${runId}`);
        if (draftRef.current && identity(draftRef.current) !== originalKey)
          throw new Error("Inputs changed while restoring. Open the saved run again to retry.");
        const d: Draft = {
          date: r.delivery_date,
          battery: r.battery,
          market: r.market,
          points: r.forecast_points,
          prices: r.forecast_points.map((p) => String(p.price_eur_mwh)),
          forecast: r.forecast,
          orders: fromOrders(r.submitted_orders, r.forecast_points),
          sourceProposalId:
            typeof r.audit.source_proposal_id === "string" ? r.audit.source_proposal_id : undefined,
        };
        setDraft(d);
        setUndo(draft);
        setSelected("");
        setNotice("");
        setResult(r);
        setResultKey(calculationIdentity(d));
        setModal(null);
        navigate("schedule");
      } else {
        setNotice(
          "Proposal analysis is archived. Saved proposal details remain available in History.",
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const loadExample = async () => {
    if (!draft || busy) return;
    const originalKey = identity(draft);
    setBusy("Loading example");
    setError("");
    try {
      const x = await api<{ points: Point[] }>(
        `/api/forecast?delivery_date=${draft.date}&product_minutes=${draft.market.product_minutes}`,
      );
      if (!draftRef.current || identity(draftRef.current) !== originalKey)
        throw new Error("Inputs changed while loading. Load the example again to retry.");
      setUndo(draft);
      change({
        points: x.points,
        prices: x.points.map((p) => String(p.price_eur_mwh)),
        forecast: {
          source_type: "illustrative",
          source_name: "Illustrative Day-Ahead example",
          version: "illustrative-v1",
          updated_at_utc: new Date().toISOString(),
          bidding_zone: draft.market.bidding_zone,
        },
        orders: examples(draft.market.product_minutes),
        sourceProposalId: undefined,
      });
      setSelected("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load example. Try again.");
    } finally {
      setBusy("");
    }
  };
  return { load, changeDate, restore, loadExample };
}
