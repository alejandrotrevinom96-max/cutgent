import "server-only";
import { createPublicKey, verify as edVerify } from "crypto";
import { getLicense } from "./settings-store";

/**
 * Verificación OFFLINE de licencias de Cutgent (Ed25519, node:crypto nativo).
 *
 * Modelo de amenaza (honesto): fuente y binarios PÚBLICOS. La licencia NO es DRM
 * — no detiene a quien recompila. Su único trabajo criptográfico es impedir que
 * alguien FABRIQUE un token válido sin la clave privada del dueño. El gate real
 * (watermark-on-export) se decide SERVER-SIDE leyendo este estado; nunca el cliente.
 *
 * Token: `CUTGENT-<p>.<sig>` donde
 *   p   = base64url(JSON del payload)
 *   sig = base64url(Ed25519(sign sobre los BYTES de la cadena `p`))
 * Se firma sobre la cadena `p` literal (no sobre el JSON re-serializado) para
 * evitar discrepancias de canonicalización entre emisor y verificador.
 */

/** Clave PÚBLICA Ed25519 (SPKI DER → base64url). Generada con scripts/gen-license-keypair.mjs.
 *  Es DEFINITIVA: cambiarla invalida toda licencia emitida. La PRIVADA vive solo
 *  con el dueño (.cutgent-license.local.json / CUTGENT_LICENSE_PRIVKEY), fuera de git. */
const PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEA9eIDaE1oM0SXQaRoi6RtAQv3D6fbMRNk7m9YnCJ9GB4";

const PREFIX = "CUTGENT-";
export type LicenseTier = "early" | "standard" | "indie";
const TIERS = new Set<LicenseTier>(["early", "standard", "indie"]);

const PUBLIC_KEY = createPublicKey({
  key: Buffer.from(PUBLIC_KEY_B64, "base64url"),
  format: "der",
  type: "spki",
});

export interface LicensePayload {
  v: number;
  email: string;
  tier: LicenseTier;
  iat: number;
  exp?: number;
}
export interface VerifyResult {
  valid: boolean;
  email?: string;
  tier?: LicenseTier;
  reason?: string;
}

/** Verifica un token de licencia (puro, sin I/O). Devuelve {valid:false,reason} si algo falla. */
export function verifyLicense(token: string): VerifyResult {
  try {
    if (typeof token !== "string" || !token.startsWith(PREFIX)) return { valid: false, reason: "formato" };
    const body = token.slice(PREFIX.length);
    const dot = body.indexOf(".");
    if (dot <= 0 || dot === body.length - 1) return { valid: false, reason: "formato" };
    const p = body.slice(0, dot);
    const sigB64 = body.slice(dot + 1);

    const sig = Buffer.from(sigB64, "base64url");
    if (sig.length !== 64) return { valid: false, reason: "firma" };
    if (!edVerify(null, Buffer.from(p), PUBLIC_KEY, sig)) return { valid: false, reason: "firma" };

    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as LicensePayload;
    if (payload.v !== 1) return { valid: false, reason: "versión" };
    if (typeof payload.email !== "string" || !payload.email) return { valid: false, reason: "email" };
    if (!TIERS.has(payload.tier)) return { valid: false, reason: "tier" };
    // exp opcional; si está PRESENTE debe ser un número válido y futuro (fail-closed
    // ante un exp malformado, p.ej. null por un --exp con basura).
    if (payload.exp !== undefined) {
      if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || Date.now() / 1000 > payload.exp) {
        return { valid: false, reason: "expirada" };
      }
    }

    return { valid: true, email: payload.email, tier: payload.tier };
  } catch {
    return { valid: false, reason: "error" };
  }
}

/** Estado de licencia SEGURO para exponer al cliente (nunca el token crudo). Fail-closed. */
export async function getLicenseState(): Promise<{ licensed: boolean; tier?: LicenseTier; email?: string }> {
  try {
    const token = await getLicense();
    if (!token) return { licensed: false };
    const r = verifyLicense(token);
    return r.valid ? { licensed: true, tier: r.tier, email: r.email } : { licensed: false };
  } catch {
    return { licensed: false };
  }
}

/** ¿El export debe llevar marca de agua? Fail-closed: ante CUALQUIER error → true.
 *  Única fuente de la decisión del gate para las rutas de render (server-side). */
export async function shouldWatermark(): Promise<boolean> {
  try {
    return !(await getLicenseState()).licensed;
  } catch {
    return true;
  }
}
