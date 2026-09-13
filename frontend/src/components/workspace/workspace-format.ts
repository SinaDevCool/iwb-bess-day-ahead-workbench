export const num = (n: number, digits = 1) =>
  new Intl.NumberFormat("en-CH", { maximumFractionDigits: digits }).format(n);
export const euro = (n: number) =>
  new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
export const clock = (timestamp: string, zone = "Europe/Zurich") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
