/** Forecast provenance survives upload, targeted edits and saved snapshots. */
export type ForecastMetadata = {
  source_type: "illustrative" | "manual" | "file";
  source_name: string;
  version: string;
  created_at_utc?: string;
  bidding_zone: string;
  content_hash?: string;
  original_content_hash?: string;
  imported_at_utc?: string;
  /** Time applied to the working case; not a provider publication timestamp. */
  updated_at_utc?: string;
  provider_id?: string;
  issued_at_utc?: string;
  adjusted_intervals?: number;
  original_price_values?: number[];
};

export type ForecastPoint = { timestamp_utc: string; price_eur_mwh: number };
