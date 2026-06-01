# Radio Ibiza — Portal Cobrança (Conta Azul)

Next.js + Prisma (Postgres) + OAuth2 Conta Azul. Lista **clientes com parcelas de receita vencidas e em aberto** (filtro por intervalo de **data de vencimento** na API), enriquecidas com **cadastro de pessoas** (CNPJ/documento e e-mail quando a API devolver).

## Variáveis de ambiente

Copie [`.env.example`](.env.example) para `.env` e preencha:

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres (ex.: [Neon](https://neon.tech)) — armazena `access_token` / `refresh_token` |
| `CONTA_AZUL_CLIENT_ID` | Portal do Desenvolvedor |
| `CONTA_AZUL_CLIENT_SECRET` | Portal do Desenvolvedor |
| `CONTA_AZUL_REDIRECT_URI` | **Exatamente** a URL registrada no app (ex.: `https://SEU-SITE.netlify.app/api/contaazul/callback`) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (mesmo domínio; usada em redirects se necessário) |

Opcionalmente, para **Consulta painel** no painel principal (botão ao lado de “Ver protótipo HTML”) → `POST /api/radio-painel/query`:

| Variável | Uso |
|----------|-----|
| `RADIO_PAINEL_ENABLED` | `1`, `true` ou `yes` — ativa `POST /api/radio-painel/query`. |
| `RADIO_PAINEL_BASE_URL` | Padrão `https://painel.radioibiza.com.br`. |
| `RADIO_PAINEL_EMAIL` + `RADIO_PAINEL_PASSWORD` | Login automatizado Cake. |
| `RADIO_PAINEL_SESSION_COOKIE` | Alternativa: cookie `CAKEPHP=...` copiado do browser autenticado. |
| `RADIO_PAINEL_CLIENTES_INDEX_SEARCH_PATH` | Template da lista de clientes (use `{q}` no URL se o índice do painel for personalizado). |
| `RADIO_PAINEL_HTML_SEARCH_FALLBACK` | Opcional — `1` tenta lista HTML do painel se o CSV não tiver resultado (mais frágil). |
| `RADIO_PAINEL_EXPORT_CSV_PATH` | Opcional — caminho absoluto a outro ficheiro export (substitui `data/export-clientes.csv`). |

**Busca por nome (cliente ou PDV):** o servidor usa **`data/export-clientes.csv`** (export do painel, botão *Exportar* em [painel › exports](https://painel.radioibiza.com.br/adm/exports)). Mantenha essa cópia na pasta `data/` e faça novo deploy sempre que atualizar a planilha; em alternativa, configure `RADIO_PAINEL_EXPORT_CSV_PATH` para um ficheiro noutra localização.

**E-mail agregado — cobranças em aberto:** no painel principal (após conectar Conta Azul), use o bloco **«E-mail agregado — cobranças em aberto»** para editar assunto e corpo (placeholders `{{CLIENTE}}`, `{{CNPJ}}`, `{{TABELA_PARCELAS}}`, `{{TOTAL}}`, `{{DOCUMENTOS}}`, `{{MARCA}}`). O envio por cliente usa o mesmo SMTP que **Envios manuais** (`OC_EMAIL_SMTP_*`, `OC_EMAIL_FROM`). **Boletos iugu:** usa-se o `{uuid}` de `#/fatura/visualizar/` (ex. em **`chargeRequests[].url`** ao cliente enviarem o link público da fatura — pode **ser diferente** do `chargeRequests[].id`; o servidor prioriza a URL dessa página). Depois **`GET`** `https://public.contaazul.com/payments/billing/charge/file/{uuid}`. Lista `chargeRequests` e outros campos são normalizados para o mesmo fluxo. Se falhar ou for só HTML (Pix etc.), só o link vai no corpo do e-mail. Modelo gravado na tabela `cobranca_aberta_email_template`.

**Planilha Rio (`/planilha-rio`):** novo fluxo baseado na **lista de pessoas com perfil Cliente** (`GET /v1/pessoas`, `tipo_perfil=Cliente`). A resposta pode vir em envelopes variados (`data.items`, etc.), omissão de **`perfis`** ou **`ativo` incoerente** no payload resumido — o código trata esses casos para não ficar com lista vazia por engano. Por competência (mês civil) você **regista o mês** na base e usa **Sincronizar Conta Azul** para popular/atualizar linhas. **A busca de números de contrato** chama `/v1/contratos` **por cliente** e costuma estourar timeout no Netlify (~10s Free / ~26s Pro) — no painel há opção **desmarcada por defeito** para sync rápido; sem isso as colunas de contrato mantêm o que já estava gravado (ou «sem contrato» na primeira vez). No painel, **contratos** e **enriquecimento** (`/v1/pessoas?ids`) vêm **desmarcados** por defeito (evitam timeouts no Netlify). Variáveis opcionais **`RIO_SYNC_CONTRACTS_DEFAULT`** e **`RIO_SYNC_PERSON_DETAILS_DEFAULT`** forçam servidor a ligá-los. Ao sincronizar, o portal compara com o **mês civil anterior já guardado** e marca linhas como **entrada** / **saida** ou **—** (estável só quando existia nos dois meses). O export oficial **Cliente.csv** (`Nome`, `Razão Social`, `CNPJ`, `CPF`, `Email principal`, `E-mail Contato`, `Observações`, … em `;`) é aceite diretamente — o interno monta um id estável por CNPJ/CPF (`import: só dígitos`) para repetires o import todos os meses e alinhar com **entrada/saída** (checkbox por defeito) comparando ao mês gravado antes. **Importação por ficheiro:** no painel use **Importar CSV / Excel** (ou `POST` multipart `file` em `/api/rio-planilha/clientes/month/YYYYMM/import`) — **substitui** todas as linhas e PDVs da competência, **sem** chamar a Conta Azul. Baixe o modelo em `/planilha-rio-import-exemplo.csv` no site; o UUID da pessoa na CA, deixe `ca_person_id` vazio e use **CNPJ/CPF** (gera id interno `import:…`). Exportação `.xlsx` para baixar depois de editar. Tabelas novas `rio_comp_*` (as `rio_planilha_*` antigas permanecem no schema para migração legada até remoção). Rode `prisma migrate deploy`.

**Envio automático (cron opcional):** configure `OC_EMAIL_CRON_SECRET` (≥16 caracteres) ou reutilize `CRON_SECRET`. Agende um job diário (**horário Brasília**) que faça **GET ou POST** em  
`https://SEU_DOMINIO/api/manual-envios/oc-email/auto-dispatch`  
com cabeçalho `Authorization: Bearer <SEGREDO>`. Neste endpoint o servidor só envia e-mail para linhas do **mês corrente (Brasil)** cujo campo **«Dia OC»** coincide com **o dia atual**, com **Pedir OC** ativo e **status Pendente**; se já tiver **Solicitada OC** ou **Enviada**, não envia. Após SMTP OK marca **Solicitada OC** e grava uma marca de dia idempotente; ao voltar o status manualmente para **Pendente**, essa marca é limpa para permitir um novo ciclo.

## Banco de dados (local)

```bash
# após definir DATABASE_URL no .env
npx prisma migrate deploy
npm run dev
```

## Fluxo OAuth

1. Usuário clica **Conectar Conta Azul** → `/api/contaazul/login` → redireciona para `auth.contaazul.com`.
2. Após autorizar, a Conta Azul chama `/api/contaazul/callback?code=...&state=...`.
3. O servidor troca o `code` por tokens em `https://auth.contaazul.com/oauth2/token` e grava no Postgres.

Documentação: [Solicitando código](https://developers.contaazul.com/requestingcode), [Trocar por token](https://developers.contaazul.com/changecode).

### Planilha Rio — erro Prisma «Transaction not found» na sync ou timeout HTML na importação MARCA

- **Prisma (`Transaction API error … Transaction ID is invalid`)**: costuma aparecer quando a competência tem muitas linhas/PDVs e a transação leva vários segundos com centenas de `create()` — o servidor Postgres (Neon pooler) fecha a sessão antes do commit. Mantenha o código atualizado (**sync** já usa `createMany` em blocos e timeouts longos) e use **`DATABASE_URL` pooled** do Neon.
- **`Inactivity Timeout` no site (HTML)** ao importar MARCA ou ao sincronizar com lista grande: na **Netlify Free** corta habitualmente aos **~10 s** — não aumenta só com código; o botão MARCA pode servir para ficheiros curtos ou plano rápido. Para **carga inicial** use o comando abaixo no teu computador (**fala só com Postgres**, sem esse teto HTTP).
- **Sync CA + «Enriquecer cadastro»** também pode estoirar esse limite — **desmarca** primeiro enriquecer e contratos, sincroniza (lista básica), depois aumenta tempo no Netlify (Pro até ~**26 s** com pedido ao suporte) ou usa **`npm run dev`** já com `.env`.

### Planilha Rio — MARCA + PDVs pela linha de comando (evita timeout Netlify)

1. Na raiz do repo, defina **`DATABASE_URL`** (Neon **Pooled**, o mesmo texto que tens nas variáveis da Netlify) em **`.env.local`** e/ou **`.env`**. O comando lê primeiro **`.env`** e depois sobrepõe com **`.env.local`**. Se `DATABASE_URL` estiver ausente ou ainda em `localhost` de exemplo mas tiveres a URL pooled noutra variável, podes usar **`DATABASE_POOL_URL=...`** (só para este script).
2. A competência (YYYYMM) já deve ter linhas de cliente (nome fantasia / ids CA) como farias antes de clicar «MARCA + PDVs» no site.

Ficheiro versionado neste repo: **`data/rio-marca-pdv-planilha-inicial.csv`** (exportação MARCA/col. A‑H).

```bash
# Exemplo: maio de 2026 ⇒ 202605
npm run rio:apply-marca-layout -- 202605

# URL do Neon (pooled) sem guardar no .env — uso único (entre aspas!)
npm run rio:apply-marca-layout -- --database-url="postgresql://…pooler…neon.tech/…?sslmode=require" 202605

# Ou só a string num ficheiro (uma linha, sem espaços extra)
echo 'postgresql://…' > neon-url.txt
npm run rio:apply-marca-layout -- --database-url-file=./neon-url.txt 202605

# Outro CSV
npm run rio:apply-marca-layout -- 202605 "/caminho/outro.csv"
```

O npm script faz **esbuild** sobre o `.ts` e corre o bundle gerado em `.rio-marca-layout.run.cjs` (local, ignorado no git).

O comando mostra um resumo e lista nomes da planilha que **não** cruzaram com `nome_fantasia` já na base — normalmente por texto diferente do que a CA gravou.

**Contratos CA / detalhes por API** continuam sendo muitos pedidos; sem refactor em vários pedidos pelo browser dá timeout em hospedagens curtas — use sync **rápida** primeiro, ou trabalhe em **`localhost`**.

## Netlify

1. Crie um banco Postgres (Neon) e copie `DATABASE_URL`.
2. Repo no GitHub/GitLab → **Import** na Netlify.
3. **Environment variables**: variáveis do portal + Postgres + **integração opcional Painel** (`RADIO_PAINEL_*`, ver tabela nas variáveis de ambiente).
4. Build (config em [`netlify.toml`](netlify.toml)): primeiro roda [`scripts/netlify-migrate.mjs`](scripts/netlify-migrate.mjs) — `prisma migrate deploy` com **várias tentativas** (útil quando o Neon “acorda”); depois `npm run build`.
5. No Portal Conta Azul, cadastre a mesma `CONTA_AZUL_REDIRECT_URI` de produção.
6. Primeiro deploy: authorize o app com um usuário **do ERP Conta Azul** (não o login do portal desenvolvedor).

### Netlify + Neon — erro `P1001` / Can't reach database

Se o deploy falhar no passo migrate:

- No painel Neon, copie **`DATABASE_URL` da conexão pooled** (“**Pooled**” — o host inclui habitualmente **`pooler`** quando o Neon assim o etiqueta).
- Confirme `?sslmode=require` na URL se o modelo do Neon não a trouxer já.
- Garanta que o projeto Neon **não está em pausa** e que **não há restrição de IP** bloqueando os builders Netlify.

**Último recurso:** variável Netlify `SKIP_PRISMA_MIGRATE=1` (só temporário) faz o build ignorar migrações; rode `npx prisma migrate deploy` localmente contra o mesmo banco e remova essa flag de seguida.

## Painel cobrança — contratos em cache

- **Atualizar** só traz parcelas vencidas da Conta Azul (sem buscar contratos).
- Números de contrato ATIVO ficam em `client_portal_meta` (`active_contract_numbers`).
- **Atualizar contratos** chama a CA em lotes de **10** clientes (`POST /api/clients/contracts-refresh-batch`) e grava no Postgres; se falhar no meio, clique de novo para **continuar** do último lote.

## Rate limit

A Conta Azul indica limites da ordem de **600 req/min** por conta ERP; a sincronização pagina resultados de `contas-a-receber/buscar`.

## Protótipo estático

[`public/prototype.html`](public/prototype.html) — HTML de referência (tabela de exemplo; sem integração Painel).