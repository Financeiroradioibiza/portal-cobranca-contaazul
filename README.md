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

**Envios manuais — e-mail OC:** em `/manual` pode editar o modelo (nome do cliente, mês etc.) e, com `OC_EMAIL_SMTP_*` + `OC_EMAIL_FROM` configurados (**Locaweb**, normalmente porta **587/TLS**), cada linha tem **«Disparar e-mail OC»**. Todos os envios incluem automaticamente **BCC para `cobranca@radioibiza.com.br`** (cópia oculta; não duplica se já estiver em «Para»). O modelo fica em Postgres (`oc_email_template`). As variáveis `OC_EMAIL_*` podem ficar todas no Netlify (**Site configuration → Environment variables**); após criar ou alterar, faça novo deploy ou "Clear cache and deploy" se o build ler cache antigo.

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

## Netlify

1. Crie um banco Postgres (Neon) e copie `DATABASE_URL`.
2. Repo no GitHub/GitLab → **Import** na Netlify.
3. **Environment variables**: variáveis do portal + Postgres + **integração opcional Painel** (`RADIO_PAINEL_*`, ver tabela nas variáveis de ambiente).
4. Build (já em [`netlify.toml`](netlify.toml)): `npx prisma migrate deploy && npm run build`
5. No Portal Conta Azul, cadastre a mesma `CONTA_AZUL_REDIRECT_URI` de produção.
6. Primeiro deploy: authorize o app com um usuário **do ERP Conta Azul** (não o login do portal desenvolvedor).

## Rate limit

A Conta Azul indica limites da ordem de **600 req/min** por conta ERP; a sincronização pagina resultados de `contas-a-receber/buscar`.

## Protótipo estático

[`public/prototype.html`](public/prototype.html) — HTML de referência (tabela de exemplo; sem integração Painel).