import { useId, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Allocation assumption, not execution status; supports keyboard and touch. */
export function AtLimit() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  function show() {
    setHost(trigger.current?.closest("dialog") ?? document.body);
    const box = trigger.current?.getBoundingClientRect();
    if (box)
      setPosition({
        left: Math.max(12, Math.min(box.left, window.innerWidth - 280)),
        top: box.bottom + 110 < window.innerHeight ? box.bottom + 6 : Math.max(12, box.top - 110),
      });
    setOpen(true);
  }
  useEffect(() => {
    const dismiss = () => setOpen(false);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  return (
    <span className="at-limit">
      <button
        ref={trigger}
        type="button"
        className="at-limit-trigger"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={show}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        At limit
      </button>
      {open &&
        host &&
        createPortal(
          <span id={id} style={position} className="at-limit-help" role="tooltip">
            Full allocation assumed in this simulation; actual allocation may differ.
          </span>,
          // Native modal dialogs occupy the top layer; keep their tooltip in that layer.
          host,
        )}
    </span>
  );
}
