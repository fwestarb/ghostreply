-- 001_create_app_users.sql
-- Tabela de usuários própria do backend. Chamada de "app_users" (e não
-- "users") de propósito: o Supabase já tem uma tabela interna
-- "auth.users" usada pelo Supabase Auth. Este backend NÃO usa o
-- Supabase Auth — ele possui seu próprio sistema de autenticação
-- (bcrypt + JWT), e o Supabase aqui serve só como banco Postgres.
-- Manter nomes diferentes evita qualquer confusão entre os dois modelos.

create extension if not exists "uuid-ossp";

create table if not exists app_users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null unique,
  password_hash text, -- null quando a conta foi criada via Google
  avatar_url text,
  provider text not null default 'password', -- 'password' | 'google'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_email on app_users (lower(email));

-- Este backend acessa a tabela com a service role key (bypassa RLS),
-- então RLS fica desabilitado por padrão. Caso no futuro algum client
-- público precise ler esta tabela diretamente, habilite RLS e crie
-- políticas explícitas antes disso.


-- 002_create_refresh_tokens.sql
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


-- 003_create_password_resets.sql
create table if not exists password_resets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_resets_user_id on password_resets (user_id);


-- 004_create_company_profile.sql
-- Perfil da empresa atendida: um registro por usuário do sistema.
-- É daqui que sai o "tom de voz" injetado no prompt de geração de
-- respostas, junto com o nome da empresa e uma descrição curta do
-- negócio. Sem isso, o modelo responde genérico; com isso, ele
-- responde como um atendente daquela empresa específica.
--
-- Mantido separado de knowledge_entries de propósito: aqui é
-- configuração única (1 linha), lá é conteúdo em lista (N linhas).

create table if not exists company_profile (
  user_id uuid primary key references app_users(id) on delete cascade,
  company_name text not null default '',
  business_summary text not null default '',
  tone_of_voice text not null default '',
  escalation_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Este backend acessa a tabela com a service role key (bypassa RLS),
-- igual ao restante do schema (ver 001_create_app_users.sql).


-- 005_create_knowledge_entries.sql
-- Base de conhecimento da empresa: FAQs, políticas e observações
-- livres que serão injetadas no prompt a cada geração de resposta.
--
-- Optamos deliberadamente por injetar TODAS as entradas no prompt em
-- vez de fazer busca vetorial (RAG). Para uma base de dezenas de
-- itens isso é mais simples, mais barato e mais confiável: o modelo
-- sempre enxerga tudo, sem risco de "a busca não trouxe o trecho
-- certo". Se a base crescer para milhares de itens, aí sim vale
-- migrar para embeddings — e o campo "type" já ajuda a segmentar.

create table if not exists knowledge_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  type text not null default 'faq', -- 'faq' | 'policy' | 'note'
  title text not null default '',   -- pergunta (faq) ou nome da política
  content text not null,            -- resposta / texto da política
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_entries_type_check check (type in ('faq', 'policy', 'note'))
);

create index if not exists idx_knowledge_entries_user_id on knowledge_entries (user_id);
create index if not exists idx_knowledge_entries_user_type on knowledge_entries (user_id, type);


-- 006_backend_only_access.sql
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
