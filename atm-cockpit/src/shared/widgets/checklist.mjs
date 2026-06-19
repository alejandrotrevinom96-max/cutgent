// Pure checklist logic. Items: [{label, done}]. Local widget state only (no caps).

export function toggle(items, index) {
  return items.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
}

export function addItem(items, label) {
  if (!label || !String(label).trim()) return items;
  return [...items, { label: String(label).trim(), done: false }];
}

export function progress(items) {
  const total = items.length;
  const done = items.filter((it) => it.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, complete: total > 0 && done === total };
}
