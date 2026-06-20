# Entrega automática de licencias (Stripe → email)

Webhook serverless (Supabase Edge Function) que, al completarse un pago en Stripe,
**mintea una licencia Ed25519** (byte-idéntica a `scripts/issue-license.mjs`, verifica
con `src/lib/license.ts`) y la **envía por email con Resend**. Vive fuera del
instalador de la app; lo único que toca la app (la clave pública embebida) NO cambia.

- `migrations/0001_licenses.sql` — tabla `licenses` (idempotente por `session_id`).
- `functions/stripe-webhook/index.ts` — el handler (Deno).
- `config.toml` — `verify_jwt = false` para este function.

## Estado: ANDAMIAJE listo. Falta pegar credenciales (abajo) y desplegar.

Mantén **`LICENSE_DRY_RUN=1`** hasta verificar el dominio en Resend: el webhook
funciona y guarda en la tabla, pero loguea el email en vez de enviarlo.

## Secrets (placeholders → pega los reales)

Secrets (en el **dashboard de Supabase → Edge Functions → stripe-webhook → Secrets**,
o con `supabase secrets set` si tienes el CLI):

```
STRIPE_WEBHOOK_SECRET=whsec_...         # lo da Stripe al crear el endpoint (paso 3)
LICENSE_PRIVATE_KEY=<privateKeyB64>     # = campo "privateKeyB64" de .cutgent-license.local.json (NUNCA a git)
RESEND_API_KEY=re_...                   # tu cuenta Resend
FROM_EMAIL="Cutgent <licencias@cutgent.com>"   # dominio verificado en Resend (mientras: onboarding@resend.dev)
LICENSE_DRY_RUN=1                        # 1 = no envía (loguea); quítalo/0 para enviar de verdad
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.
# STRIPE_SECRET_KEY NO hace falta: el webhook solo verifica firma, no llama a la API.
```

## Despliegue

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push                                  # crea la tabla licenses
supabase functions deploy stripe-webhook --no-verify-jwt
# URL resultante: https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
```

## Conectar en Stripe (LIVE)

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint** → pega la URL de arriba.
2. Eventos: **solo** `checkout.session.completed`.
3. Copia el **Signing secret** (`whsec_...`) → `supabase secrets set STRIPE_WEBHOOK_SECRET=...`.
4. Confirma que los 2 Payment Links tengan `metadata.tier` = `early` / `standard` (ya lo tienen).
5. Prueba: `stripe trigger checkout.session.completed` (o una compra real con `LICENSE_DRY_RUN=1`) y revisa los logs + la tabla `licenses`.
6. Cuando el dominio esté verificado en Resend, pon `LICENSE_DRY_RUN=0` para enviar.

El tier **indie** se sigue emitiendo a mano con `node scripts/issue-license.mjs --email x --tier indie`.
