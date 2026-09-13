"use client";
import { readPreference, writePreference } from "@/lib/session-preferences";
import { useEffect, useState } from "react";
import { choices, defaults, type Column } from "./columns";
/** A maximum of five optional values preserves the table's usable width. */
export function useColumns() {
  const [columns, setColumns] = useState<Column[]>(defaults);
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = readPreference("iwb-evidence-columns");
      if (Array.isArray(saved))
        setColumns(
          [
            ...new Set(
              saved.filter((c): c is Column => typeof c === "string" && Object.hasOwn(choices, c)),
            ),
          ].slice(0, 5),
        );
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const update = (next: Column[]) => {
    setColumns(next);
    writePreference("iwb-evidence-columns", next);
  };
  return { columns, update };
}
