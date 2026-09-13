import type { Market } from "@/types/api";

/** Empty input is not zero. The server remains authoritative for imported grids. */
export function isInvalidPrice(
  raw: string,
  market: Pick<Market, "min_price_eur_mwh" | "max_price_eur_mwh">,
): boolean {
  const value = Number(raw);
  return (
    !raw.trim() ||
    !Number.isFinite(value) ||
    value < market.min_price_eur_mwh ||
    value > market.max_price_eur_mwh
  );
}
