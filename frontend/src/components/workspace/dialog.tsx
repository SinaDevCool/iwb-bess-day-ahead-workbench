"use client";
import { X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
const DialogFooterContext = createContext<HTMLElement | null>(null);
const CloseGuardContext = createContext<React.MutableRefObject<(() => boolean) | null> | null>(
  null,
);
export function useDialogCloseGuard(guard: () => boolean) {
  const targetRef = useContext(CloseGuardContext);
  useEffect(() => {
    if (targetRef) targetRef.current = guard;
    return () => {
      if (targetRef) targetRef.current = null;
    };
  }, [targetRef, guard]);
}
export function DialogActions({ children }: { children: React.ReactNode }) {
  const target = useContext(DialogFooterContext);
  return target ? createPortal(<div className="ws-dialog-footer">{children}</div>, target) : null;
}
export function Dialog({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const guard = useRef<(() => boolean) | null>(null);
  const requestClose = () => {
    if (!guard.current || guard.current()) close();
  };
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
      className={`ws-dialog${wide ? " ws-dialog-wide" : ""}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      aria-label={title}
    >
      <div className="ws-section-head ws-dialog-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label={`Close ${title}`} onClick={requestClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <DialogFooterContext.Provider value={footer}>
        <CloseGuardContext.Provider value={guard}>
          <div className="ws-dialog-body">{children}</div>
        </CloseGuardContext.Provider>
      </DialogFooterContext.Provider>
      <div ref={setFooter} className="ws-dialog-footer-slot" />
    </dialog>
  );
}
