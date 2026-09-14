"""Bounded CSV ingestion; all sources reuse the domain delivery-grid validation."""

import csv
import hashlib
import io
import json
from datetime import datetime, timezone

from pydantic import ValidationError

from backend.domain.models import MarketConfig, PricePoint, SimulationRequest
from backend.services.forecast_import_errors import ForecastImportError, issue

MAX_UPLOAD_BYTES = 256_000


def forecast_hash(points):
    canonical = [
        (p.timestamp_utc.astimezone(timezone.utc).isoformat(), p.price_eur_mwh) for p in points
    ]
    return hashlib.sha256(json.dumps(canonical, separators=(",", ":")).encode()).hexdigest()


def import_csv(raw: bytes, delivery_date: str, market: MarketConfig):
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("CSV must be smaller than 256 KB")
    try:
        # Accept an optional spreadsheet UTF-8 BOM without altering header matching.
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("Use a UTF-8 CSV file") from error
    try:
        reader = iter(list(csv.reader(io.StringIO(text), strict=True)))
    except csv.Error as error:
        raise ValueError(
            "Malformed CSV: check quoted fields and use the downloaded template"
        ) from error
    header = next(reader, [])
    if header != ["delivery_start", "price_eur_mwh"]:
        message = (
            "Use template columns: delivery_start,price_eur_mwh (comma-separated, decimal point)"
        )
        raise ForecastImportError(message, [issue("invalid_header", "header", message, 1)])
    points = []
    errors = []
    seen = set()
    interval_rows = 0
    for row_number, row in enumerate(reader, 2):
        # Spreadsheet exports may end with empty lines; a timestamp with a blank
        # price is still an error and must never be silently interpreted as zero.
        if not row:
            continue
        interval_rows += 1
        # The longest supported local day is 25 hours: 100 quarter-hour intervals.
        if interval_rows > 100:
            raise ValueError("A delivery day cannot contain more than 100 intervals")
        try:
            if len(row) != 2:
                errors.append(
                    issue(
                        "invalid_columns",
                        "row",
                        "Use exactly two comma-separated columns.",
                        row_number,
                    )
                )
                continue
            if not row[1].strip():
                errors.append(
                    issue(
                        "missing_price",
                        "price_eur_mwh",
                        "Enter a price; blank is not zero.",
                        row_number,
                    )
                )
                continue
            point = PricePoint(timestamp_utc=row[0].strip(), price_eur_mwh=row[1].strip())
            if point.timestamp_utc.tzinfo is None or point.timestamp_utc.utcoffset() is None:
                errors.append(
                    issue(
                        "invalid_timestamp",
                        "delivery_start",
                        "Include an explicit UTC offset in the timestamp.",
                        row_number,
                    )
                )
                continue
            stamp = point.timestamp_utc.astimezone(timezone.utc)
            if stamp in seen:
                errors.append(
                    issue(
                        "duplicate_interval",
                        "delivery_start",
                        "This delivery interval appears more than once.",
                        row_number,
                    )
                )
                continue
            seen.add(stamp)
            points.append(point)
        except ValidationError as error:
            for detail in error.errors(include_url=False, include_input=False):
                field = str(detail["loc"][0]) if detail["loc"] else "row"
                timestamp = field == "timestamp_utc"
                errors.append(
                    issue(
                        "invalid_timestamp" if timestamp else "invalid_price",
                        "delivery_start" if timestamp else "price_eur_mwh",
                        "Enter an ISO timestamp with an offset."
                        if timestamp
                        else "Enter a finite numeric price using a decimal point.",
                        row_number,
                    )
                )
    if errors:
        missing = sum(item["code"] == "missing_price" for item in errors)
        summary = (
            f"{missing} prices are missing. Fill the price column and upload again."
            if missing == len(errors)
            else f"{len(errors)} {'issue needs' if len(errors) == 1 else 'issues need'} attention. Correct the listed rows and upload again."
        )
        raise ForecastImportError(summary, errors)
    try:
        validated = SimulationRequest(delivery_date=delivery_date, market=market, prices=points)
    except ValidationError as error:
        messages = [
            item["msg"].removeprefix("Value error, ")
            for item in error.errors(include_url=False, include_input=False)
        ]
        message = (
            "; ".join(dict.fromkeys(messages))
            + ". Check the delivery date and duration, or download a matching template."
        )
        raise ForecastImportError(
            message, [issue("wrong_delivery_grid", "delivery_start", message)]
        ) from error
    digest = forecast_hash(validated.prices)
    return {
        "points": validated.prices,
        "forecast": {
            "source_type": "file",
            "source_name": "CSV import",
            "version": digest[:12],
            "content_hash": digest,
            "original_content_hash": digest,
            "original_price_values": [p.price_eur_mwh for p in points],
            "imported_at_utc": datetime.now(timezone.utc),
            "bidding_zone": market.bidding_zone,
        },
    }
