create table if not exists password_resets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_resets_user_id on password_resets (user_id);
