"use client";
import { api, type ApiIssue } from "@/lib/api";
import { forecastCsv, downloadForecastCsv } from "@/lib/forecast-csv";
import type { ForecastMetadata, ForecastPoint } from "@/types/forecast";
import { useEffect, useRef, useState } from "react";
export type ForecastPreview = { points: ForecastPoint[]; forecast: ForecastMetadata };
type Preview = ForecastPreview;
type Point = ForecastPoint;
/** Preview is local: only the caller's Apply action replaces the shared forecast. */
export function useForecastLoader(
  date: string,
  minutes: number,
  points: { timestamp_utc: string }[],
) {
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<ApiIssue[]>([]);
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
    setIssues([]);
    const current = ++request.current;
    setFilename(file.name);
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 256000) {
      setBusy(false);
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
      if (mounted.current && current === request.current) setPreview(next);
    } catch (e) {
      if (mounted.current && current === request.current) {
        setError(e instanceof Error ? e.message : String(e));
        setIssues((e as { issues?: ApiIssue[] }).issues ?? []);
      }
    } finally {
      if (mounted.current && current === request.current) setBusy(false);
    }
  }
  function template() {
    downloadForecastCsv(forecastCsv(points, true), `DA-forecast-${date}-${minutes}min-blank.csv`);
  }
  async function demo(download = false) {
    const current = ++request.current;
    setBusy(true);
    setError("");
    setIssues([]);
    if (!download) {
      setPreview(undefined);
      setFilename("Illustrative demo");
    }
    try {
      const r = await api<{ points: Point[] }>(
        `/api/forecast?delivery_date=${date}&product_minutes=${minutes}`,
      );
      if (!mounted.current || current !== request.current) return;
      if (download)
        downloadForecastCsv(forecastCsv(r.points), `DA-forecast-${date}-${minutes}min-example.csv`);
      else
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
      if (mounted.current && current === request.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current && current === request.current) setBusy(false);
    }
  }
  return {
    preview,
    error,
    issues,
    busy,
    filename,
    pasted,
    setPasted,
    providers,
    upload,
    template,
    demo,
  };
}
