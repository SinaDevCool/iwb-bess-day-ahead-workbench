"use client";
import { Fragment } from "react";
import type { ForecastMetadata } from "@/types/forecast";
import { dateTimeText } from "@/lib/time-presentation";
import { useDisplayTimezone } from "./time-preference";

/** Provenance belongs to the displayed snapshot, never to the current clock. */
export function ForecastSnapshot({
  forecast,
  preview = false,
  compact = false,
  simple = false,
}: {
  forecast?: ForecastMetadata;
  preview?: boolean;
  compact?: boolean;
  simple?: boolean;
}) {
  const zone = useDisplayTimezone();
  const time = (value?: string) =>
    value && Number.isFinite(Date.parse(value)) ? dateTimeText(value, zone) : "Not recorded";
  if (simple) {
    const fields = [
      ["Source", forecast?.source_name],
      ["Source issued", forecast?.issued_at_utc ? time(forecast.issued_at_utc) : undefined],
      ["Imported", forecast?.imported_at_utc ? time(forecast.imported_at_utc) : undefined],
      ["Source version", forecast?.version],
      ["Content fingerprint", forecast?.content_hash?.slice(0, 12)],
    ].filter(([, value]) => value);
    return (
      <div className="forecast-snapshot compact">
        {!preview && (
          <span>
            {forecast?.updated_at_utc
              ? `Updated in this case: ${time(forecast.updated_at_utc)}`
              : "Update time unavailable"}
          </span>
        )}
        {!!fields.length && (
          <details>
            <summary>Source details</summary>
            <dl>
              {fields.map(([label, value]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
            </dl>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className={`forecast-snapshot${compact ? " compact" : ""}`}>
      {!compact && <strong>{forecast?.source_name ?? "Entered forecast"}</strong>}
      <span>
        {preview
          ? "Preview — not applied"
          : `${compact ? "Updated" : "Updated in this case"}: ${time(forecast?.updated_at_utc)}`}
      </span>
      {!compact && (
        <details>
          <summary>Snapshot details</summary>
          <dl>
            <dt>Source issued</dt>
            <dd>{time(forecast?.issued_at_utc)}</dd>
            <dt>Imported</dt>
            <dd>{time(forecast?.imported_at_utc)}</dd>
            <dt>Source version</dt>
            <dd>{forecast?.version ?? "Not recorded"}</dd>
            <dt>Content fingerprint</dt>
            <dd>{forecast?.content_hash?.slice(0, 12) ?? "Recomputed when simulated"}</dd>
            <dt>Adjusted intervals</dt>
            <dd>{forecast?.adjusted_intervals ?? 0}</dd>
          </dl>
          <small>
            Case update times are recorded by this browser. Source issue times are supplied by the
            source.
          </small>
        </details>
      )}
    </div>
  );
}
