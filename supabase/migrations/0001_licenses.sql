-- Licencias emitidas automáticamente tras un pago de Stripe.
-- Idempotencia por session_id: un checkout = una fila (Stripe puede reintentar).
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tier text not null check (tier in ('early', 'standard', 'indie')),
  license_key text not null,
  session_id text not null unique,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists licenses_email_idx on public.licenses (email);

-- RLS ON sin policies: solo la Edge Function (SERVICE_ROLE, bypassa RLS) escribe/lee.
alter table public.licenses enable row level security;
