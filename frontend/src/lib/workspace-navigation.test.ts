import { describe, expect, it } from "vitest";
import { workspaceUrl, workspaceView } from "./workspace-navigation";

describe("unified navigation", () => {
  it.each([
    ["", "orders"],
    ["mode=optimize", "orders"],
    ["workspace=inputs", "orders"],
    ["workspace=schedule", "schedule"],
    ["workspace=analysis", "compare"],
    ["workspace=history", "compare"],
    ["tab=proof", "proof"],
    ["tab=compare", "compare"],
  ])("maps %s to %s", (query, expected) => {
    expect(workspaceView(new URLSearchParams(query))).toBe(expected);
  });
  it("removes split-workbench routing without losing saved-run references", () => {
    const url = workspaceUrl(
      new URL(
        "https://example.test/?mode=optimize&workspace=inputs&runs=a,b&reference=a",
      ),
      "schedule",
    );
    expect(url.searchParams.get("mode")).toBeNull();
    expect(url.searchParams.get("workspace")).toBeNull();
    expect(url.searchParams.get("runs")).toBe("a,b");
    expect(workspaceView(url.searchParams)).toBe("schedule");
  });
});
