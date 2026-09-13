import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { OrderSuggestionsDialog } from "./order-suggestions-dialog";
import type { Draft } from "./workspace-types";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const draft = {
  date: "2026-09-09",
  battery: {},
  market: { product_minutes: 60 },
  points: [{ timestamp_utc: "2026-09-08T22:00:00Z" }],
  prices: ["40"],
  orders: [],
} as unknown as Draft;
const suggestion = {
  client_order_id: "suggested-1",
  delivery_start_utc: draft.points[0].timestamp_utc,
  side: "BUY",
  order_type: "LIMIT",
  volume_mw: 10,
  limit_price_eur_mwh: 40,
};
const valid = { feasible: true, contribution_eur: 100, improvement_eur: 50, issues: [] };
function setup() {
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/api/order-suggestions"
      ? { input_hash: "hash", orders: [suggestion], validation: valid }
      : valid,
  );
  const add = vi.fn(),
    close = vi.fn();
  const view = render(<OrderSuggestionsDialog draft={draft} add={add} close={close} />);
  return { add, close, ...view };
}
it("accepts once after final validation without mutating the baseline", async () => {
  const { add } = setup();
  const button = await screen.findByRole("button", { name: "Add selected orders" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  expect(add).toHaveBeenCalledWith([suggestion]);
  expect(draft.orders).toEqual([]);
});
it("clear selection and cancel add nothing", async () => {
  const { add, close } = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Clear selection" }));
  expect(screen.getByRole("button", { name: "Add selected orders" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
});
it("blocks a preview after input changes", async () => {
  const { rerender, add, close } = setup();
  await screen.findByRole("button", { name: "Clear selection" });
  rerender(<OrderSuggestionsDialog draft={{ ...draft, prices: ["60"] }} add={add} close={close} />);
  expect(screen.getByText(/Inputs changed/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add selected orders" })).toBeDisabled();
});
it("does not append a subset that fails final validation", async () => {
  const { add } = setup();
  const button = screen.getByRole("button", { name: "Add selected orders" });
  await waitFor(() => expect(button).toBeEnabled());
  vi.mocked(api).mockResolvedValue({
    ...valid,
    feasible: false,
    issues: ["Insufficient stored energy"],
  });
  fireEvent.click(button);
  await screen.findByText("Insufficient stored energy");
  expect(add).not.toHaveBeenCalled();
});
