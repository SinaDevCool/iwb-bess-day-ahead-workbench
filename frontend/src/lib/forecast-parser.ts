export type ForecastParseError = { row: number; message: string };
export type ForecastParseResult = { values: number[]; errors: ForecastParseError[] };

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseForecast(
  input: string,
  expectedCount: number,
  minPrice: number,
  maxPrice: number,
): ForecastParseResult {
  const text = input.trim();
  if (!text) return { values: [], errors: [{ row: 1, message: "Paste forecast prices first." }] };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const timed = lines.some((line) => timePattern.test(line.split(/[;,\t]/)[0]?.trim() ?? ""));
  const values: number[] = [];
  const errors: ForecastParseError[] = [];
  const seen = new Set<string>();

  if (!timed) {
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    tokens.forEach((token, index) => {
      const value = Number(token);
      if (!Number.isFinite(value)) errors.push({ row: index + 1, message: `“${token}” is not a valid price.` });
      else if (value < minPrice || value > maxPrice) errors.push({ row: index + 1, message: `Price must be between ${minPrice} and ${maxPrice} €/MWh.` });
      else values.push(value);
    });
  } else {
    lines.forEach((line, index) => {
      if (/^(time|delivery|hour)/i.test(line)) return;
      const parts = line.split(/[;\t,]/).map((part) => part.trim());
      const clock = parts[0];
      if (!timePattern.test(clock)) { errors.push({ row: index + 1, message: "Use HH:mm followed by a price." }); return; }
      if (seen.has(clock)) { errors.push({ row: index + 1, message: `${clock} appears more than once.` }); return; }
      seen.add(clock);
      const raw = parts.slice(1).join(".").replace(",", ".");
      const value = Number(raw);
      if (!Number.isFinite(value)) errors.push({ row: index + 1, message: `Enter a valid price for ${clock}.` });
      else if (value < minPrice || value > maxPrice) errors.push({ row: index + 1, message: `Price must be between ${minPrice} and ${maxPrice} €/MWh.` });
      else values.push(value);
    });
  }
  if (!errors.length && values.length !== expectedCount) errors.push({ row: 0, message: `Expected ${expectedCount} prices but found ${values.length}.` });
  return { values, errors };
}
