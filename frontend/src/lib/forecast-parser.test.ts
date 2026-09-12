import { describe, expect, it } from "vitest";
import { parseForecast } from "./forecast-parser";

describe("parseForecast", () => {
  it("parses plain line, comma and semicolon separated values", () => {
    expect(parseForecast("1, 2; 3\n4", 4, -500, 4000)).toEqual({ values: [1, 2, 3, 4], errors: [] });
  });
  it("parses timestamped rows and ignores a header", () => {
    expect(parseForecast("Time;Price\n00:00;55\n01:00;42", 2, -500, 4000)).toEqual({ values: [55, 42], errors: [] });
  });
  it("reports duplicates, range errors and the wrong count", () => {
    expect(parseForecast("00:00;55\n00:00;42", 2, -500, 4000).errors[0].message).toContain("appears more than once");
    expect(parseForecast("5000", 1, -500, 4000).errors[0].message).toContain("between");
    expect(parseForecast("1 2", 3, -500, 4000).errors[0].message).toContain("Expected 3");
  });
});
