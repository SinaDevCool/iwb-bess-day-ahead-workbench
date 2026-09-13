import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useSavedRunComparison } from "./use-saved-run-comparison";
import type { Simulation } from "@/types/api";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  history.replaceState({}, "", "/");
});

it("loads an explicitly linked proposal outside the recent catalogue", async () => {
  history.replaceState({}, "", "/?tab=compare&runs=sim-older&focus=sim-older");
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith("/api/simulation-runs")
      ? { items: [] }
      : ({ simulation_id: "sim-older" } as never),
  );
  const { result } = renderHook(useSavedRunComparison);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.focusedId).toBe("sim-older");
  expect(result.current.runs[0].simulation_id).toBe("sim-older");
});

it("a delayed detail response cannot replace a newer history selection", async () => {
  let finish!: (run: Simulation) => void;
  history.replaceState({}, "", "/?tab=compare&runs=sim-old");
  vi.mocked(api).mockImplementation((path) => {
    if (path.startsWith("/api/simulation-runs")) return Promise.resolve({ items: [] }) as never;
    if (path.endsWith("sim-old"))
      return new Promise<Simulation>((resolve) => {
        finish = resolve;
      }) as never;
    return Promise.resolve({ simulation_id: "sim-new" }) as never;
  });
  const { result } = renderHook(useSavedRunComparison);
  await waitFor(() => expect(finish).toBeDefined());
  act(() => {
    history.pushState({}, "", "/?tab=compare&runs=sim-new&focus=sim-new");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(result.current.focusedId).toBe("sim-new"));
  await act(async () => {
    finish({ simulation_id: "sim-old" } as Simulation);
  });
  expect(result.current.runs.map((run) => run.simulation_id)).toEqual(["sim-new"]);
  expect(result.current.focusedId).toBe("sim-new");
});
