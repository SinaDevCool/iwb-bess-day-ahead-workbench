import { expect, it } from "vitest";
import { axisTime, deliveryTime, intervalTime, deadlineTime } from "./time-presentation";
import { parseForecast } from "./forecast-parser";
it("formats the same instant without moving delivery boundaries", () => {
  const timestamp = "2026-09-08T22:00:00Z";
  expect(deliveryTime(timestamp, 60, "Europe/Zurich")).toBe("00:00–01:00");
  expect(deliveryTime(timestamp, 60, "UTC")).toBe("22:00–23:00");
  expect(axisTime(Date.parse("2026-09-09T22:00:00Z"), Date.parse(timestamp), "UTC")).toBe(
    "22:00 · 09 Sept",
  );
});
it("distinguishes repeated hours without redundant offsets", () => {
  expect(intervalTime("2026-10-25T00:15:00Z", "Europe/Zurich")).toBe("02:15 · first");
  expect(intervalTime("2026-10-25T01:15:00Z", "Europe/Zurich")).toBe("02:15 · second");
  expect(intervalTime("2026-10-25T01:15:00Z", "UTC")).toBe("01:15");
});
it("resolves clock-only pasted data in the selected zone against the same grid", () => {
  const grid = [
    { timestamp_utc: "2026-09-08T22:00:00Z" },
    { timestamp_utc: "2026-09-08T23:00:00Z" },
  ];
  const local = parseForecast("00:00;5\n01:00;-2", 2, -500, 4000, grid, "Europe/Zurich");
  const utc = parseForecast("22:00;5\n23:00;-2", 2, -500, 4000, grid, "UTC");
  expect(local).toEqual(utc);
  expect(utc.values).toEqual([5, -2]);
});
it("converts the deadline label, not the configured deadline", () => {
  expect(
    deadlineTime([{ timestamp_utc: "2026-09-09T09:00:00Z" }], "11:00", "Europe/Zurich", "UTC"),
  ).toBe("09:00");
});
it("uses the preceding day's offset across daylight saving changes", () => {
  expect(
    deadlineTime([{ timestamp_utc: "2026-03-29T09:00:00Z" }], "11:00", "Europe/Zurich", "UTC"),
  ).toBe("10:00");
  expect(
    deadlineTime([{ timestamp_utc: "2026-10-25T10:00:00Z" }], "11:00", "Europe/Zurich", "UTC"),
  ).toBe("09:00");
});
