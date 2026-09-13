export type ForecastParseError = { row: number; message: string };
export type ForecastParseResult = {
  values: number[];
  errors: ForecastParseError[];
};

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseForecast(
  input: string,
  expectedCount: number,
  minPrice: number,
  maxPrice: number,
  grid?: { timestamp_utc: string }[],
  zone = "Europe/Zurich",
): ForecastParseResult {
  const text = input.trim();
  if (!text)
    return {
      values: [],
      errors: [{ row: 1, message: "Paste forecast prices first." }],
    };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const timed = lines.some((line) => /^(\d\d:\d\d|\d{4}-\d\d-\d\dT)/.test(line));
  const values: number[] = [];
  const errors: ForecastParseError[] = [];
  const seen = new Set<string>();

  if (!timed) {
    if (/(?:[,;]\s*[,;]|^[,;]|[,;]$|\n\s*\n)/.test(text))
      return {
        values: [],
        errors: [{ row: 0, message: "Blank forecast cells are not valid prices." }],
      };
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    tokens.forEach((token, index) => {
      const value = Number(token);
      if (!Number.isFinite(value))
        errors.push({
          row: index + 1,
          message: `“${token}” is not a valid price.`,
        });
      else if (value < minPrice || value > maxPrice)
        errors.push({
          row: index + 1,
          message: `Price must be between ${minPrice} and ${maxPrice} €/MWh.`,
        });
      else values.push(value);
    });
  } else {
    const clocks =
      grid?.map((x) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(x.timestamp_utc)),
      ) ??
      Array.from(
        { length: expectedCount },
        (_, i) =>
          `${String(Math.floor((i * (expectedCount > 25 ? 15 : 60)) / 60)).padStart(2, "0")}:${String((i * (expectedCount > 25 ? 15 : 60)) % 60).padStart(2, "0")}`,
      );
    const mapped = new Map<number, number>();
    lines.forEach((line, index) => {
      if (/^(time|delivery|hour)/i.test(line)) return;
      const parts = line.split(/[;\t,]/).map((part) => part.trim());
      const clock = parts[0];
      let slot = -1;
      if (timePattern.test(clock)) {
        if (clocks.filter((x) => x === clock).length > 1) {
          errors.push({
            row: index + 1,
            message: `${clock} is ambiguous. Use an ISO timestamp with UTC offset.`,
          });
          return;
        }
        slot = clocks.indexOf(clock);
      } else if (/(?:Z|[+-]\d\d:\d\d)$/.test(clock)) {
        slot = grid?.findIndex((x) => Date.parse(x.timestamp_utc) === Date.parse(clock)) ?? -1;
      }
      if (slot < 0) {
        errors.push({
          row: index + 1,
          message: `${clock} does not match the delivery grid.`,
        });
        return;
      }
      if (seen.has(clock)) {
        errors.push({
          row: index + 1,
          message: `${clock} appears more than once.`,
        });
        return;
      }
      seen.add(clock);
      if (mapped.has(slot)) {
        errors.push({
          row: index + 1,
          message: `${clock} appears more than once.`,
        });
        return;
      }
      if (parts.length !== 2) {
        errors.push({
          row: index + 1,
          message: "Use exactly one timestamp and one price per row (decimal point).",
        });
        return;
      }
      const raw = parts[1];
      const value = Number(raw);
      if (!raw.trim() || !Number.isFinite(value))
        errors.push({
          row: index + 1,
          message: `Enter a valid price for ${clock}; blank is not zero.`,
        });
      else if (value < minPrice || value > maxPrice)
        errors.push({
          row: index + 1,
          message: `Price must be between ${minPrice} and ${maxPrice} €/MWh.`,
        });
      else mapped.set(slot, value);
    });
    for (let i = 0; i < expectedCount; i++) if (mapped.has(i)) values.push(mapped.get(i)!);
  }
  if (!errors.length && values.length !== expectedCount)
    errors.push({
      row: 0,
      message: `Expected ${expectedCount} prices but found ${values.length}.`,
    });
  return { values, errors };
}
