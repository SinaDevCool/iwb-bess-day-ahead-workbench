import { useEffect, useRef, useState } from "react";

/** Layout only. Draft values stay in the workbench when the ticket relocates. */
export function useOrderLayout(view: string) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const element = layoutRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 1180));
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);
  return { layoutRef, wide };
}
