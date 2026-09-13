import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { CostEditor } from "./cost-editor";
import { Dialog } from "./dialog";
import type { Draft } from "./workspace-types";

// jsdom has no native modal implementation; expose it as open for accessibility queries.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(cleanup);
it("stages cost edits and applies only market values", () => {
  const draft = {
    market: {
      exchange_fee_eur_per_mwh: 0,
      clearing_fee_eur_per_mwh: 0.015,
      exchange_fee_policy: "excluded",
    },
  } as Draft;
  const apply = vi.fn();
  render(
    <Dialog title="Costs" close={vi.fn()}>
      <CostEditor draft={draft} apply={apply} cancel={vi.fn()} />
    </Dialog>,
  );
  fireEvent.change(screen.getByLabelText("Exchange €/MWh"), { target: { value: "2" } });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply settings" }));
  expect(apply).toHaveBeenCalledWith({ market: { ...draft.market, exchange_fee_eur_per_mwh: 2 } });
});
it("rejects a blank fee instead of converting it to zero", () => {
  const draft = {
    market: {
      exchange_fee_eur_per_mwh: 0,
      clearing_fee_eur_per_mwh: 0.015,
      exchange_fee_policy: "excluded",
    },
  } as Draft;
  render(
    <Dialog title="Costs" close={vi.fn()}>
      <CostEditor draft={draft} apply={vi.fn()} cancel={vi.fn()} />
    </Dialog>,
  );
  fireEvent.change(screen.getByLabelText("Exchange €/MWh"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Apply settings" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("non-negative finite");
  expect(screen.getByLabelText("Exchange €/MWh")).toHaveAttribute("aria-invalid", "true");
  fireEvent.click(screen.getByRole("button", { name: "Review invalid fees" }));
  expect(screen.getByLabelText("Exchange €/MWh")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("Exchange €/MWh"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Clearing €/MWh"), { target: { value: "-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Review invalid fees" }));
  expect(screen.getByLabelText("Clearing €/MWh")).toHaveFocus();
  expect(screen.getByLabelText("Clearing €/MWh")).toHaveAccessibleDescription(
    "Enter a clearing fee of zero or more.",
  );
});
