import React, { useState } from "react";
// @ts-ignore shared pure ESM
import { toggle, addItem, progress } from "../../shared/widgets/checklist.mjs";

interface Item { label: string; done: boolean; }

// checklist widget — caps: ["brain.get_note"]. Local state; pure reducers.
export function Checklist({ seed }: { seed?: Item[] }) {
  const [items, setItems] = useState<Item[]>(seed ?? []);
  const [draft, setDraft] = useState("");
  const p = progress(items);
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Checklist {p.total ? `· ${p.done}/${p.total} (${p.pct}%)` : ""}</h3>
      <div className="body">
        {items.map((it, i) => (
          <label key={i} className="line" style={{ display: "block", cursor: "pointer" }}>
            <input type="checkbox" checked={it.done} onChange={() => setItems(toggle(items, i))} />{" "}
            <span style={{ textDecoration: it.done ? "line-through" : "none", color: it.done ? "var(--muted)" : "var(--text)" }}>{it.label}</span>
          </label>
        ))}
        <input
          value={draft}
          placeholder="add item…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setItems(addItem(items, draft)); setDraft(""); } }}
          style={{ width: "100%", marginTop: 6, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px" }}
        />
      </div>
    </div>
  );
}
