import { describe, expect, it } from "vitest";
import { parseForecast } from "./forecast-parser";

describe("parseForecast", () => {
  it("uses UTC offsets to disambiguate repeated DST hours",()=>{
    const grid=[{timestamp_utc:"2026-10-25T00:00:00Z"},{timestamp_utc:"2026-10-25T01:00:00Z"}];
    expect(parseForecast("02:00;1\n02:00;2",2,-500,4000,grid).errors[0].message).toContain("ambiguous");
    expect(parseForecast("2026-10-25T02:00:00+01:00;2\n2026-10-25T02:00:00+02:00;1",2,-500,4000,grid).values).toEqual([1,2]);
    expect(parseForecast("1,,2",2,-500,4000).errors.length).toBeGreaterThan(0);
  });
  it("maps timed prices, rejects blanks and off-grid hours", () => {
    expect(parseForecast("01:00;42\n00:00;55", 2, -500, 4000).values).toEqual([55,42]);
    expect(parseForecast("00:00;\n01:00;42", 2, -500, 4000).errors.length).toBeGreaterThan(0);
    expect(parseForecast("00:30;1\n01:00;2", 2, -500, 4000).errors[0].message).toContain("grid");
  });
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
