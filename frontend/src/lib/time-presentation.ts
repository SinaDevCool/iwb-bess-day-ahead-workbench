/** Presentation only. UTC instants and the market delivery calendar never change. */
export type DisplayTimezone = "Europe/Zurich" | "UTC";
export const dateTimeText = (value: string, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const timeText = (value: string | number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
export const dateText = (value: string | number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "2-digit", month: "short" }).format(
    new Date(value),
  );

/** Repeated local times are distinguished without adding a timezone to every label. */
export function intervalTime(value: string | number, zone: string) {
  const instant = new Date(value).getTime();
  const label = timeText(instant, zone);
  const same = (other: number) =>
    timeText(other, zone) === label && dateText(other, zone) === dateText(instant, zone);
  return `${label}${same(instant + 3600000) ? " · first" : same(instant - 3600000) ? " · second" : ""}`;
}
export function deliveryTime(value: string, minutes: number, zone: string) {
  const end = Date.parse(value) + minutes * 60000;
  const nextDay = dateText(value, zone) !== dateText(end, zone);
  return `${intervalTime(value, zone)}–${timeText(end, zone)}${nextDay ? ` (${dateText(end, zone)})` : ""}`;
}
export function axisTime(value: number, start: number, zone: string) {
  return `${timeText(value, zone)}${dateText(value, zone) !== dateText(start, zone) ? ` · ${dateText(value, zone)}` : ""}`;
}

/** Day-ahead deadline: preceding market day, including a DST change overnight. */
export function deadlineTime(
  points: { timestamp_utc: string }[],
  local: string,
  marketZone: string,
  displayZone: string,
) {
  const [hour, minute] = local.split(":").map(Number);
  const anchor = points.find(
    (point) => Number(timeText(point.timestamp_utc, marketZone).slice(0, 2)) === hour,
  );
  if (!anchor) return "See market assumptions";
  const previous = Date.parse(anchor.timestamp_utc) - 86400000;
  const [previousHour, previousMinute] = timeText(previous, marketZone).split(":").map(Number);
  const adjustment = (hour - previousHour) * 60 + minute - previousMinute;
  return timeText(previous + adjustment * 60000, displayZone);
}
