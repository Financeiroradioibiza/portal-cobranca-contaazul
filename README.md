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

Opcionalmente, para **Consulta painel** (`public/prototype.html` → servidor):

| Variável | Uso |
|----------|-----|
| `RADIO_PAINEL_ENABLED` | `1`, `true` ou `yes` — ativa `POST /api/radio-painel/query`. |
| `RADIO_PAINEL_BASE_URL` | Padrão `https://painel.radioibiza.com.br`. |
| `RADIO_PAINEL_EMAIL` + `RADIO_PAINEL_PASSWORD` | Login automatizado Cake. |
| `RADIO_PAINEL_SESSION_COOKIE` | Alternativa: cookie `CAKEPHP=...` copiado do browser autenticado. |
| `RADIO_PAINEL_CLIENTES_INDEX_SEARCH_PATH` | Template da lista de clientes (use `{q}` no URL se o índice do painel for personalizado). |
| `RADIO_PAINEL_PROXY_SECRET` | Opcional: mesmo valor como header `x-radio-painel-secret`. Na consola: `window.__RADIO_PAINEL_PROXY_SECRET`. |

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

[`public/prototype.html`](public/prototype.html) — HTML de referência com grade de exemplo. Botão **Consulta painel** chama a API Next `POST /api/radio-painel/query`; as credenciais ficam apenas em variáveis de ambiente no Netlify/`env` (**não** vão para o navegador). Ative `RADIO_PAINEL_ENABLED=1` e configure login ou cookie conforme [.env.example](.env.example).
