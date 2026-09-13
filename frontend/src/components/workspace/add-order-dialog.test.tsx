import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Battery, Market } from "@/types/api";
import { AddOrderDialog } from "./add-order-dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(cleanup);
function setup(minutes: 15 | 60 = 60, count = minutes === 60 ? 24 : 96) {
  const add = vi.fn();
  const close = vi.fn();
  const points = Array.from({ length: count }, (_, i) => ({
    timestamp_utc: new Date(Date.UTC(2026, 8, 8, 22) + i * minutes * 60000).toISOString(),
  }));
  render(
    <AddOrderDialog
      points={points}
      prices={points.map(() => "45")}
      market={
        {
          product_minutes: minutes,
          volume_increment_mw: 0.1,
          price_increment_eur_mwh: 0.01,
          min_price_eur_mwh: -500,
          max_price_eur_mwh: 4000,
        } as Market
      }
      battery={{} as Battery}
      add={add}
      close={close}
    />,
  );
  return { add, close };
}
function fill(interval = "0", limit = "0") {
  fireEvent.change(screen.getByLabelText("Delivery for order 1"), { target: { value: interval } });
  fireEvent.change(screen.getByLabelText("Volume for order 1"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Limit price for order 1"), { target: { value: limit } });
}
it.each([15, 60] as const)("offers every %s-minute interval without existing orders", (minutes) => {
  const { add } = setup(minutes);
  expect(screen.getAllByRole("option").length).toBe((minutes === 60 ? 24 : 96) + 5);
  expect(screen.getByLabelText("Delivery for order 1")).toHaveValue("-1");
  expect(screen.getByLabelText("Volume for order 1")).toHaveValue(null);
  expect(screen.getByLabelText("Limit price for order 1")).toHaveValue(null);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Add order" }));
  fireEvent.click(screen.getByRole("button", { name: "Add order" }));
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0][0]).toMatchObject({
    interval: 0,
    volume: "10",
    limit: "0",
    orderType: "LIMIT",
  });
});
it("validates an unselected interval and empty fields without adding", () => {
  const { add } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Add order" }));
  expect(screen.getByText("Choose a valid delivery interval.")).toBeInTheDocument();
  expect(screen.getByText("Enter a positive volume.")).toBeInTheDocument();
  expect(screen.getByText("Enter a valid limit price.")).toBeInTheDocument();
  expect(add).not.toHaveBeenCalled();
});
it.each(["Cancel", "Close Add order"])("%s discards the new ticket", (name) => {
  const { add, close } = setup();
  fill("23", "-20");
  fireEvent.click(screen.getByRole("button", { name }));
  expect(close).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
});
it("Escape closes without adding", () => {
  const { add, close } = setup();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
});
it("supports the last interval, sell orders and negative prices", () => {
  const { add } = setup(15);
  fill("95", "-20");
  fireEvent.change(screen.getByLabelText("Side for order 1"), { target: { value: "SELL" } });
  expect(screen.getByText("Minimum sell price")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add order" }));
  expect(add.mock.calls[0][0]).toMatchObject({ interval: 95, side: "SELL", limit: "-20" });
});
it("clears Market limits and does not invent a limit when switching back", () => {
  const { add } = setup();
  fill();
  const type = screen.getByLabelText("Type for order 1");
  fireEvent.change(type, { target: { value: "MARKET" } });
  expect(screen.queryByLabelText("Limit price for order 1")).not.toBeInTheDocument();
  fireEvent.change(type, { target: { value: "LIMIT" } });
  expect(screen.getByLabelText("Limit price for order 1")).toHaveValue(null);
  fireEvent.change(type, { target: { value: "MARKET" } });
  fireEvent.click(screen.getByRole("button", { name: "Add order" }));
  expect(add.mock.calls[0][0]).toMatchObject({ orderType: "MARKET", limit: "" });
});
it("uses the supplied DST grid rather than assuming 24 hours", () => {
  setup(15, 100);
  expect(screen.getAllByRole("option")).toHaveLength(105);
});
