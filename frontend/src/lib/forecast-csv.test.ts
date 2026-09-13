import { expect, it } from "vitest";
import { forecastCsv } from "./forecast-csv";
it("separates blank templates from upload-ready example data", () => {
  const points = [
    { timestamp_utc: "2026-09-08T22:00:00Z", price_eur_mwh: 0 },
    { timestamp_utc: "2026-09-08T23:00:00Z", price_eur_mwh: -25 },
  ];
  expect(forecastCsv(points)).toBe(
    "delivery_start,price_eur_mwh\r\n2026-09-08T22:00:00Z,0\r\n2026-09-08T23:00:00Z,-25\r\n",
  );
  expect(forecastCsv(points, true)).toContain("2026-09-08T22:00:00Z,\r\n");
});
