# Ativar GhostReply localmente

Extensão Chrome para sugerir respostas no WhatsApp Web. A extensão chama
o backend; as chaves do banco e da IA ficam somente em `backend/.env`.
As sugestões precisam de revisão humana. Instruções no prompt não garantem
que a IA nunca invente informações.

## 1. Banco gratuito no Supabase

Crie um projeto no plano Free. No painel do projeto:

1. Abra **SQL Editor** e execute o conteúdo de
   `backend/src/database/setup.sql`. Ele reúne as seis migrações;
   não apaga os dados existentes. Faça uma cópia dos dados se já houver
   informações importantes nesse banco.
2. Em **Settings → API Keys**, copie a chave **secret** do servidor.
   A chave legada `service_role` também é aceita. A chave publishable/anon
   não serve para este backend.
3. Preencha em `backend/.env`:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=COLE_AQUI_A_CHAVE_SECRETA
```

O arquivo SQL ativa RLS e retira acesso das funções anon/authenticated
às cinco tabelas. O backend usa autenticação própria e acesso de servidor.
Nunca copie essa chave para a extensão ou publique o `.env`.

## 2. IA gratuita

Configure sua chave OpenRouter somente no backend:

```dotenv
OPENROUTER_API_KEY=COLE_SUA_CHAVE_NO_ARQUIVO_LOCAL
OPENROUTER_MODEL=openrouter/free
OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
```

`openrouter/free` escolhe um modelo gratuito compatível com o pedido.
O modelo escolhido pode variar. O backend bloqueia modelos pagos e não
repete automaticamente pedidos com falha. Cotas, disponibilidade e tempo
de resposta variam; não há promessa de uso gratuito ilimitado.

Cada ação de IA envia o texto selecionado e, em geração/revisão, as
informações relevantes da empresa ao provedor externo. Revise quais
informações de clientes você envia.

Referências: [Free Router](https://openrouter.ai/openrouter/free),
[limites](https://openrouter.ai/docs/api/reference/limits),
[chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

## 3. Iniciar e verificar

No PowerShell:

```powershell
cd backend
npm ci
npm test
npm run check:setup
# Opcional: consome uma solicitação real da cota gratuita
npm run check:setup -- --ai
npm start
```

`GET http://localhost:4000/api/health` indica se as variáveis foram
preenchidas; isso sozinho não confirma conexão ao banco ou à IA.
`check:setup` verifica acesso às cinco tabelas sem listar dados pessoais.
Reinicie o servidor após editar `.env`.

## 4. Carregar a extensão

1. Abra `chrome://extensions`, ative **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha
   a raiz deste repositório clonado.
3. Confira se o ID coincide com `CORS_ALLOWED_ORIGINS` no `.env`;
   ajuste a origem `chrome-extension://ID` se necessário.
4. Abra WhatsApp Web e faça cadastro/login no GhostReply.
5. Cadastre o perfil da empresa e uma informação de atendimento.
6. Gere sugestões e confira antes de enviar ao cliente.

SMTP para recuperar senha e login Google são opcionais e ainda exigem
configuração própria. Cadastro/login com e-mail dependem do banco.
O backend precisa estar em execução para a extensão funcionar.

