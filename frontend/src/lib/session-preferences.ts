/** Storage is optional convenience; failure must never block an in-memory edit. */
export function readPreference(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing or quota failure: retain the current in-memory state. */
  }
}
