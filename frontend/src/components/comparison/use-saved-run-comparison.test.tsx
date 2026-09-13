import { api } from "@/lib/api";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSavedRunComparison } from "./use-saved-run-comparison";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("serializes rapid selection requests and does not append duplicate runs", async () => {
  history.replaceState({}, "", "/");
  vi.mocked(api)
    .mockResolvedValueOnce({
      items: [{ simulation_id: "a" }, { simulation_id: "b" }, { simulation_id: "c" }],
    })
    .mockResolvedValueOnce({ simulation_id: "a" })
    .mockResolvedValueOnce({ simulation_id: "b" });
  const { result } = renderHook(() => useSavedRunComparison());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let finish: (value: unknown) => void = () => {};
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let first: Promise<void>;
  act(() => {
    first = result.current.addOrRemove("c");
    void result.current.addOrRemove("c");
  });
  expect(vi.mocked(api).mock.calls.filter(([path]) => path === "/api/simulations/c")).toHaveLength(
    1,
  );
  await act(async () => {
    finish({ simulation_id: "c" });
    await first;
  });
  expect(result.current.selectedIds).toEqual(["a", "b", "c"]);
});
