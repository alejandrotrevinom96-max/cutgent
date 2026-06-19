#!/usr/bin/env node
/**
 * Genera UNA VEZ el par de claves Ed25519 para firmar licencias de Cutgent.
 *
 *   node scripts/gen-license-keypair.mjs
 *
 * - La clave PÚBLICA (SPKI DER → base64url, ~59 chars) se EMBEBE en
 *   src/lib/license.ts (constante PUBLIC_KEY_B64). Es definitiva: cambiarla
 *   invalida TODA licencia ya emitida.
 * - La clave PRIVADA (PKCS8 DER → base64url) es el ÚNICO secreto real. Se guarda
 *   en `.cutgent-license.local.json` (gitignored) y debe RESPALDARSE con cuidado:
 *   si se pierde, no se pueden emitir más licencias; si se filtra, cualquiera
 *   puede emitir y hay que rotar la pública (invalida todo).
 *
 * No sobrescribe un par existente salvo que pases --force.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, ".cutgent-license.local.json");
const force = process.argv.includes("--force");

if (existsSync(outFile) && !force) {
  console.error(`✗ Ya existe ${outFile}. Usa --force para regenerar (¡invalida licencias emitidas!).`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64url");
const privB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url");

writeFileSync(outFile, JSON.stringify({ alg: "ed25519", privateKeyB64: privB64, publicKeyB64: pubB64, createdAt: new Date().toISOString() }, null, 2) + "\n");

console.log("PUBLIC_KEY_B64 (pega esto en src/lib/license.ts):");
console.log(pubB64);
console.log("");
console.log(`Clave privada guardada en: ${outFile}  (gitignored — RESPÁLDALA)`);
console.log(`Para emitir licencias: node scripts/issue-license.mjs --email x@y.com --tier early`);
