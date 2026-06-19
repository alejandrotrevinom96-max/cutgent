#!/usr/bin/env node
/**
 * Emite una licencia firmada de Cutgent (offline). El dueño la corre tras ver el
 * pago en Stripe, o para regalar a un cineasta indie.
 *
 *   node scripts/issue-license.mjs --email alguien@correo.com --tier early
 *   node scripts/issue-license.mjs --email indie@correo.com --tier indie
 *
 * Tiers: early | standard | indie. Sin --exp la licencia es PERMANENTE (pago único).
 *
 * La clave privada se toma de (en orden): env CUTGENT_LICENSE_PRIVKEY (PKCS8
 * base64url) o el archivo .cutgent-license.local.json generado por
 * gen-license-keypair.mjs. Imprime el token `CUTGENT-...` listo para enviar.
 */
import { createPrivateKey, sign as edSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIERS = new Set(["early", "standard", "indie"]);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg("email");
const tier = arg("tier");
const expDays = arg("exp"); // opcional: días hasta expirar (solo pruebas)

if (!email || !email.includes("@")) { console.error("✗ Falta --email válido."); process.exit(1); }
if (!TIERS.has(tier)) { console.error(`✗ --tier debe ser uno de: ${[...TIERS].join(", ")}`); process.exit(1); }

function loadPrivateKeyB64() {
  if (process.env.CUTGENT_LICENSE_PRIVKEY) return process.env.CUTGENT_LICENSE_PRIVKEY.trim();
  const f = path.join(root, ".cutgent-license.local.json");
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")).privateKeyB64;
  return null;
}

const privB64 = loadPrivateKeyB64();
if (!privB64) {
  console.error("✗ No encuentro la clave privada. Define CUTGENT_LICENSE_PRIVKEY o corre gen-license-keypair.mjs.");
  process.exit(1);
}

const privateKey = createPrivateKey({ key: Buffer.from(privB64, "base64url"), format: "der", type: "pkcs8" });

let exp;
if (expDays !== undefined) {
  const days = Number(expDays);
  if (!Number.isFinite(days) || days <= 0) { console.error("✗ --exp debe ser un número de días > 0."); process.exit(1); }
  exp = Math.floor(Date.now() / 1000) + days * 86400;
}
const payload = { v: 1, email, tier, iat: Math.floor(Date.now() / 1000), ...(exp !== undefined ? { exp } : {}) };

const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = edSign(null, Buffer.from(p), privateKey).toString("base64url");
const token = `CUTGENT-${p}.${sig}`;

console.log(`\nLicencia para ${email} (${tier}${payload.exp ? `, expira en ${expDays}d` : ", permanente"}):\n`);
console.log(token);
console.log(`\nEnvíasela y que la pegue en Cutgent → Ajustes → Licencia.`);
