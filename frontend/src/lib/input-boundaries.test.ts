import { afterEach, describe, expect, it, vi } from "vitest";
import { isInvalidPrice } from "./price-input";
import { readPreference, writePreference } from "./session-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("input and optional-storage boundaries", () => {
  const limits = { min_price_eur_mwh: -500, max_price_eur_mwh: 4000 };
  it("distinguishes blank, zero, negative prices and inclusive limits", () => {
    for (const raw of ["0", "-10", "-500", "4000"]) expect(isInvalidPrice(raw, limits)).toBe(false);
    for (const raw of ["", " ", "Infinity", "x", "-501", "4001"])
      expect(isInvalidPrice(raw, limits)).toBe(true);
  });
  it("does not let unavailable storage interrupt an in-memory edit", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("Storage denied");
      },
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    });
    expect(readPreference("columns")).toBeNull();
    expect(() => writePreference("columns", ["price"])).not.toThrow();
  });
  it("treats malformed saved JSON as an absent preference", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => "not-json" });
    expect(readPreference("columns")).toBeNull();
  });
});
