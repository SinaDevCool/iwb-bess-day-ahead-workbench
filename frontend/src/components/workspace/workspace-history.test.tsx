import { api } from "@/lib/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceHistory } from "./workspace-history";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("announces loading, focuses a saved record, and returns to the list", async () => {
  const entry = {
    simulation_id: "ord-qa",
    display_name: "QA run",
    run_type: "ORDER_SIMULATION",
    created_at_utc: "2026-09-09T12:00:00Z",
    delivery_date: "2026-09-09",
    validation_status: "passed",
    contribution_eur: 100,
  };
  let finish: (value: unknown) => void = () => {};
  vi.mocked(api)
    .mockResolvedValueOnce({ items: [entry] })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  render(<WorkspaceHistory restore={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "QA run · View details" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading saved record");
  finish({
    run: {
      ...entry,
      validation: { status: "passed" },
      forecast: { source_name: "Demo", version: "1" },
    },
    events: [],
  });
  const heading = await screen.findByRole("heading", { name: "Run ord-qa" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Activity" }));
  expect(screen.getByText("No recorded events.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to saved runs" }));
  expect(screen.getByRole("heading", { name: "Saved runs" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
});
