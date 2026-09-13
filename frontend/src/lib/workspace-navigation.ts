export type WorkspaceView = "orders" | "schedule" | "proof" | "compare";

export function workspaceView(params: URLSearchParams): WorkspaceView {
  const value = params.get("tab") ?? params.get("workspace");
  if (value === "schedule" || value === "proof" || value === "compare") return value;
  if (value === "analysis" || value === "history") return "compare";
  return "orders";
}

export function workspaceUrl(url: URL, view: WorkspaceView): URL {
  url.searchParams.delete("mode");
  url.searchParams.delete("workspace");
  url.searchParams.set("tab", view);
  return url;
}
