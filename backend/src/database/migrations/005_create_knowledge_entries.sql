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
