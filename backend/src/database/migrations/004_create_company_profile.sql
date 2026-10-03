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
