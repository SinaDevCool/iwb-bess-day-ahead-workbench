"use client";
import Link from "next/link";
import { useEffect } from "react";
/** Compatibility entry: the unified history owns both proposals and simulations. */
export default function AuditPage() {
  useEffect(() => {
    window.location.replace("/?workspace=history");
  }, []);
  return (
    <main>
      <h1>History has moved</h1>
      <Link href="/?workspace=history">Open unified run history</Link>
    </main>
  );
}
