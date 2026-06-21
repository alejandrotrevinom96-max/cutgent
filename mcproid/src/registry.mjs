import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMeta } from "./vrm.mjs";

// A license-aware registry of bases. For a COMMERCIAL product you must forge from
// a base whose license permits commercial use + modification; this is where you
// record and pick them. Flags are claims — verifyBase() checks an actual .vrm file
// against its registry entry so you can't accidentally ship on a wrong license.
const here = dirname(fileURLToPath(import.meta.url));

export function listBases() {
  return JSON.parse(readFileSync(resolve(here, "bases.json"), "utf8"));
}
export function getBase(id) { return listBases().find((b) => b.id === id) || null; }

export function pickBases({ commercial = false, modify = false } = {}) {
  return listBases().filter((b) => (!commercial || b.license.commercial) && (!modify || b.license.modify));
}

export function validateRegistry() {
  const errs = [];
  for (const b of listBases()) {
    if (!b.id) errs.push("entry missing id");
    if (!b.license || typeof b.license.commercial !== "boolean") errs.push(`${b.id || "?"}: missing license.commercial`);
    if (typeof (b.license || {}).modify !== "boolean") errs.push(`${b.id || "?"}: missing license.modify`);
  }
  return { ok: errs.length === 0, errs };
}

// Confirm a real .vrm file's embedded license matches what the registry claims.
export function verifyBase(id, buffer) {
  const entry = getBase(id);
  if (!entry) return { ok: false, reason: `no registry entry '${id}'` };
  const meta = getMeta(buffer);
  if (entry.license.commercial && !meta.commercial)
    return { ok: false, reason: `registry says commercial but file says '${meta.commercialUsage || "unknown"}'` };
  return { ok: true, meta };
}
