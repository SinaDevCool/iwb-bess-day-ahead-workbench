/** Both downloads use the same canonical offset-aware timestamps as upload. */
export function forecastCsv(
  points: { timestamp_utc: string; price_eur_mwh?: number }[],
  blank = false,
) {
  return (
    "delivery_start,price_eur_mwh\r\n" +
    points
      .map((point) => `${point.timestamp_utc},${blank ? "" : (point.price_eur_mwh ?? "")}`)
      .join("\r\n") +
    "\r\n"
  );
}
export function downloadForecastCsv(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
