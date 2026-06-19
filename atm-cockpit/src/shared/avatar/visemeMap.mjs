// Phoneme -> VRM viseme. VRM 1.0 exposes 5 mouth visemes: aa, ih, ou, ee, oh.
// Closed-mouth phonemes (M/B/P, silence) map to null = all viseme weights 0.
// Pure; zero dependencies. Engine-agnostic: the avatar only ever sees these 5 ids.

const VOWELS = {
  AA: "aa", AH: "aa", AE: "aa", AY: "aa",
  AO: "oh", AW: "oh", OW: "oh", OY: "oh",
  UW: "ou", UH: "ou", W: "ou",
  IY: "ee", EY: "ee", EH: "ee", ER: "ee", Y: "ee",
  IH: "ih",
};

const CONSONANTS = {
  // approximate mouth openness for consonants
  F: "ih", V: "ih", TH: "ih", DH: "ih", S: "ih", Z: "ih", T: "ih", D: "ih",
  N: "ih", L: "ih", R: "ih",
  K: "aa", G: "aa", NG: "aa", HH: "aa",
  SH: "ou", ZH: "ou", CH: "ou", JH: "ou",
  // closed mouth
  M: null, B: null, P: null,
};

/**
 * @param {string} phoneme  ARPAbet-ish symbol (case/stress-insensitive); "sil"/"" => closed
 * @returns {("aa"|"ih"|"ou"|"ee"|"oh"|null)}
 */
export function phonemeToViseme(phoneme) {
  if (!phoneme) return null;
  const p = phoneme.toUpperCase().replace(/[0-9]/g, "");
  if (p === "SIL" || p === "SP" || p === "PAU") return null;
  if (p in VOWELS) return VOWELS[p];
  if (p in CONSONANTS) return CONSONANTS[p];
  return "aa"; // unknown -> a neutral open shape rather than a frozen mouth
}

export const VRM_VISEMES = ["aa", "ih", "ou", "ee", "oh"];
