-- Refresh tokens são opacos (uuid gerado em app.js/token.service.js),
-- não JWTs — assim podem ser revogados individualmente a qualquer
-- momento (logout, troca de senha, suspeita de comprometimento), o que
-- um JWT autocontido não permite sem uma blocklist paralela.

create table if not exists refresh_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_refresh_tokens_user_id on refresh_tokens (user_id);
