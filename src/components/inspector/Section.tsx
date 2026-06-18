"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/** Sección colapsable con título para agrupar campos del Inspector. */
export function Section({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between px-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-text"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title}
        </button>
        {right && <div className="pl-2">{right}</div>}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}
