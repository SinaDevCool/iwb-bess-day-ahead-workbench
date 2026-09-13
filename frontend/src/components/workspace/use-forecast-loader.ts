"use client";
import { api } from "@/lib/api";
import type { ForecastMetadata, ForecastPoint } from "@/types/forecast";
import { useEffect, useRef, useState } from "react";
export type ForecastPreview = { points: ForecastPoint[]; forecast: ForecastMetadata };
type Preview = ForecastPreview;
type Point = ForecastPoint;
/** Preview is local: only the caller's Apply action replaces the shared forecast. */
export function useForecastLoader(date: string, minutes: number, points: Point[]) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [pasted, setPasted] = useState("");
  const [providers, setProviders] = useState<{ id: string; name: string; connected: boolean }[]>(
    [],
  );
  useEffect(() => {
    let active = true;
    api<{ items: typeof providers }>("/api/forecast/providers")
      .then((r) => {
        if (active) setProviders(r.items);
      })
      .catch(() => {
        if (active) setError("Provider catalogue unavailable. CSV upload remains available.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function upload(file?: File) {
    if (!file) return;
    setPreview(undefined);
    setError("");
    setFilename(file.name);
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 256000) {
      setError("Choose a UTF-8 CSV file smaller than 256 KB.");
      return;
    }
    setBusy(true);
    try {
      const next = await api<Preview>(
        `/api/forecast/import?delivery_date=${date}&product_minutes=${minutes}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: file,
        },
      );
      if (mounted.current) setPreview(next);
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function template() {
    const text =
      "delivery_start,price_eur_mwh\n" + points.map((p) => `${p.timestamp_utc},`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `DA-forecast-${date}-${minutes}min.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function demo() {
    setBusy(true);
    setError("");
    setPreview(undefined);
    setFilename("Illustrative demo");
    try {
      const r = await api<{ points: Point[] }>(
        `/api/forecast?delivery_date=${date}&product_minutes=${minutes}`,
      );
      if (mounted.current)
        setPreview({
          points: r.points,
          forecast: {
            source_type: "illustrative",
            source_name: "IWB illustrative profile",
            version: "illustrative-v1",
            bidding_zone: "CH",
          },
        });
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return { preview, error, busy, filename, pasted, setPasted, providers, upload, template, demo };
}
