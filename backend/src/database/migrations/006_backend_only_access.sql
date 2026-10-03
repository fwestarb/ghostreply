-- A extensão usa a API Express e JWT próprios. Somente o servidor
-- acessa estas tabelas com sua credencial secreta.
begin;
alter table public.app_users enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.password_resets enable row level security;
alter table public.company_profile enable row level security;
alter table public.knowledge_entries enable row level security;
revoke all on table public.app_users, public.refresh_tokens,
  public.password_resets, public.company_profile, public.knowledge_entries
  from anon, authenticated;
grant select, insert, update, delete on table public.app_users,
  public.refresh_tokens, public.password_resets, public.company_profile,
  public.knowledge_entries to service_role;
commit;
