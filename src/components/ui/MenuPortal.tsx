"use client";

import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Menú flotante que se renderiza en document.body con position: fixed, anclado
 * bajo un botón disparador. Evita por completo que los dropdowns de la barra
 * superior se clipeen por overflow o queden tapados por stacking contexts
 * (p.ej. el backdrop-filter del theme Liquid Glass). Se reposiciona en
 * resize/scroll y se cierra al hacer clic fuera.
 */
export function MenuPortal({
  anchorRef,
  open,
  onClose,
  align = "left",
  width = 224,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const top = Math.min(r.bottom + 6, window.innerHeight - 40);
      const s: React.CSSProperties = { position: "fixed", top, width, zIndex: 1001, visibility: "visible" };
      if (align === "right") {
        s.right = Math.max(margin, window.innerWidth - r.right);
      } else {
        s.left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
      }
      // Limita la altura para que no se salga por abajo.
      s.maxHeight = window.innerHeight - top - margin;
      setStyle(s);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, align, width]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000]" onClick={onClose} />
      <div style={style} className="overflow-y-auto rounded-lg border border-border bg-panel-2 shadow-xl">
        {children}
      </div>
    </>,
    document.body,
  );
}
