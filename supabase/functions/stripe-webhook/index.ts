// Supabase Edge Function (Deno). Webhook de Stripe → mintea licencia Ed25519 →
// email (Resend). Corre en Supabase, NO en el instalador de la app.
//
// El token es BYTE-IDÉNTICO al de scripts/issue-license.mjs y verifica con
// src/lib/license.ts: CUTGENT-<base64url(payload)>.<base64url(sig)>, firma
// Ed25519 sobre los BYTES de la cadena base64url del payload.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... \
//          LICENSE_PRIVATE_KEY=<privateKeyB64> RESEND_API_KEY=... FROM_EMAIL=... LICENSE_DRY_RUN=1
//
// @ts-nocheck  (entorno Deno; no se typechea con el tsc de la app)
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-03-31" });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const PRIV_B64 = Deno.env.get("LICENSE_PRIVATE_KEY") ?? ""; // PKCS8 base64url (== privateKeyB64 del .json local)
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Cutgent <onboarding@resend.dev>";
const DRY_RUN = (Deno.env.get("LICENSE_DRY_RUN") ?? "") === "1";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function mintToken(email: string, tier: string): Promise<string> {
  const payload = { v: 1, email, tier, iat: Math.floor(Date.now() / 1000) }; // sin exp = permanente
  const p = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("pkcs8", fromB64url(PRIV_B64), { name: "Ed25519" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(p)));
  return `CUTGENT-${p}.${b64url(sig)}`;
}

async function sendEmail(to: string, token: string, tier: string): Promise<boolean> {
  if (DRY_RUN || !RESEND_KEY) {
    console.log(`[DRY_RUN] email→${to} tier=${tier} token=${token}`);
    return false; // NO marcar email_sent_at: no se envió de verdad.
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: "Tu licencia de Cutgent",
      html: `<p>¡Gracias por comprar Cutgent (${tier})!</p><p>Pega esta licencia en <b>Cutgent → Ajustes → Licencia</b>:</p><pre style="white-space:pre-wrap;word-break:break-all">${token}</pre>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return true;
}

Deno.serve(async (req: Request) => {
  // Falla con diagnóstico claro si falta config (en vez de crashear críptico en
  // el primer pago real → reintentos de Stripe).
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "LICENSE_PRIVATE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!Deno.env.get(k)) return new Response(`config error: missing env ${k}`, { status: 500 });
  }
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    // ASÍNCRONO en Deno (usa WebCrypto para el HMAC del signature).
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`bad signature: ${e.message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") return new Response("ignored", { status: 200 });
  const s = event.data.object;
  if (s.payment_status !== "paid") return new Response("not paid", { status: 200 });

  const email = s.customer_details?.email ?? s.customer_email;
  const tier = s.metadata?.tier; // del Payment Link (metadata.tier)
  if (!email) return new Response("no email", { status: 200 });
  // NO asumir "standard": un tier ausente/equivocado licenciaría mal en silencio.
  if (!tier || !["early", "standard", "indie"].includes(tier)) return new Response("missing/bad tier", { status: 200 });

  const token = await mintToken(email, tier);
  // UPSERT idempotente por session_id: un reintento de Stripe no duplica ni reemite.
  const { data, error } = await supabase
    .from("licenses")
    .upsert({ email, tier, license_key: token, session_id: s.id }, { onConflict: "session_id", ignoreDuplicates: true })
    .select();
  if (error) return new Response(`db: ${error.message}`, { status: 500 });
  if (!data || data.length === 0) return new Response("duplicate, already processed", { status: 200 });

  try {
    const sent = await sendEmail(email, token, tier);
    // Solo marca enviado si REALMENTE se envió (en DRY_RUN queda null para reenviar).
    if (sent) await supabase.from("licenses").update({ email_sent_at: new Date().toISOString() }).eq("session_id", s.id);
  } catch (e) {
    console.error("email failed", e); // la fila ya está guardada; reintento manual (email_sent_at null)
  }
  return new Response("ok", { status: 200 });
});
