"""Bounded CSV ingestion; all sources reuse the domain delivery-grid validation."""

import csv
import hashlib
import io
import json
from datetime import datetime, timezone

from pydantic import ValidationError

from backend.domain.models import MarketConfig, PricePoint, SimulationRequest

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
        raise ValueError(
            "Use template columns: delivery_start,price_eur_mwh (comma-separated, decimal point)"
        )
    points = []
    errors = []
    for row_number, row in enumerate(reader, 2):
        if len(points) + len(errors) >= 100:
            raise ValueError("A delivery day cannot contain more than 100 intervals")
        try:
            if len(row) != 2 or not all(cell.strip() for cell in row):
                raise ValueError("Expected a timezone-aware timestamp and a nonblank price")
            points.append(PricePoint(timestamp_utc=row[0].strip(), price_eur_mwh=row[1].strip()))
        except ValueError:
            errors.append(
                f"Row {row_number}: use a valid timestamp and numeric price; blank is not zero"
            )
    if errors:
        raise ValueError("; ".join(errors))
    try:
        validated = SimulationRequest(delivery_date=delivery_date, market=market, prices=points)
    except ValidationError as error:
        messages = [
            item["msg"].removeprefix("Value error, ")
            for item in error.errors(include_url=False, include_input=False)
        ]
        raise ValueError(
            "; ".join(dict.fromkeys(messages))
            + ". Check the delivery date and duration, or download a matching template."
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
