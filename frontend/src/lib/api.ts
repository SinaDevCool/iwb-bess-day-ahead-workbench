const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail;
    const message = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map(item => `${Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "input"}: ${item.msg ?? "invalid value"}`).join("; ")
        : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return response.json();
}
export { API };
