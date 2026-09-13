"use client";

import { workspaceUrl } from "@/lib/workspace-navigation";

import type { WorkspaceState } from "./workspace-state";
import type { View } from "./workspace-types";
/** Keep canonical links and browser navigation separate from business calculations. */
export function useWorkspaceNavigation({
  setComparisonKind,
  setView,
}: Pick<WorkspaceState, "setComparisonKind" | "setView">) {
  const selectComparison = (kind: "simulations" | "proposals") => {
    setComparisonKind(kind);
    const url = new URL(location.href);
    url.searchParams.set("comparison", kind);
    history.replaceState({}, "", url);
  };
  const navigate = (next: View) => {
    setView(next);
    history.pushState({}, "", workspaceUrl(new URL(location.href), next));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return { selectComparison, navigate };
}
