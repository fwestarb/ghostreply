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
