"use client";
import { X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
const DialogFooterContext = createContext<HTMLElement | null>(null);
export function DialogActions({ children }: { children: React.ReactNode }) {
  const target = useContext(DialogFooterContext);
  return target ? createPortal(<div className="ws-dialog-footer">{children}</div>, target) : null;
}
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="ws-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="ws-section-head ws-dialog-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label={`Close ${title}`} onClick={close}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <DialogFooterContext.Provider value={footer}>
        <div className="ws-dialog-body">{children}</div>
      </DialogFooterContext.Provider>
      <div ref={setFooter} className="ws-dialog-footer-slot" />
    </dialog>
  );
}
