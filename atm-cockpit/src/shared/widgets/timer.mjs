// Pure timer helpers. The React widget owns the ticking; these are the pure bits.

/** Seconds -> "M:SS" or "H:MM:SS". */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Given mode + elapsed/duration, return {display, expired} for a tick. */
export function tick({ mode = "count", elapsedSec = 0, durationSec = 0 } = {}) {
  if (mode === "down") {
    const remaining = Math.max(0, durationSec - elapsedSec);
    return { display: formatClock(remaining), expired: remaining <= 0 };
  }
  return { display: formatClock(elapsedSec), expired: false };
}
