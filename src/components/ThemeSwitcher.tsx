"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { THEMES, applyTheme, getTheme, loadThemeId, saveThemeId } from "@/lib/themes";
import { MenuPortal } from "./ui/MenuPortal";

/**
 * Selector de theme. El theme inicial lo fija un script en el <head> (sin
 * flash). El menú se renderiza en un portal para que nunca se clipee.
 */
export function ThemeSwitcher() {
  const [themeId, setThemeId] = useState<string>(() => loadThemeId());
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const select = (id: string) => {
    setThemeId(id);
    applyTheme(id);
    saveThemeId(id);
    setOpen(false);
  };

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const current = getTheme(themeId);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${current.name}`}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-muted transition-colors hover:text-text"
      >
        <Palette size={14} />
        <span className="hidden max-w-[90px] truncate md:inline">{current.name}</span>
      </button>

      <MenuPortal anchorRef={btnRef} open={open} onClose={() => setOpen(false)} align="right" width={224}>
        <div className="p-1">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted">THEME (Claude Design)</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-xs ${
                t.id === themeId ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
              }`}
            >
              <span className="flex shrink-0 overflow-hidden rounded-md border border-border">
                {t.swatch.map((c, i) => (
                  <span key={i} className="h-5 w-3" style={{ background: c }} />
                ))}
              </span>
              <span className="flex-1 truncate">{t.name}</span>
              {t.id === themeId && <Check size={13} className="text-accent" />}
            </button>
          ))}
        </div>
      </MenuPortal>
    </>
  );
}
