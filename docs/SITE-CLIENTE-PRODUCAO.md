# Site Cliente — produção (`cliente.radioibiza.app.br`)

**Status:** Fase 1 — site Netlify separado + proxy API → portal  
**Admin (licenças/usuários):** permanece no portal → `/suporte/site-clientes`

---

## Arquitetura

```text
cliente.radioibiza.app.br          portal.radioibiza.app.br
├─ HTML / login (Netlify estático)   ├─ /api/site-cliente/*  (Neon + cloud2)
├─ /api/site-cliente/* ──proxy──►  ├─ /api/suporte/site-clientes/* (admin)
└─ cookie site_cliente_session       └─ middleware portal (não mistura sessões)
```

O **browser do cliente nunca** acessa Conta Azul, cloud2 ou Neon diretamente — só APIs do portal, com JWT `typ: site_cliente` + escopo por grupo.

---

## Repositório

| Pasta | Papel |
|-------|--------|
| `sites/site-cliente/` | Site Netlify (Fase 1 estático) |
| `sites/site-cliente/netlify.toml` | Proxy + headers de segurança |
| `app/api/site-cliente/` | APIs (permanecem no portal) |
| `lib/site-cliente/` | Sessão, permissões, dashboard |

---

## Netlify — criar o site (passo a passo)

### 1. Novo site no Netlify

No painel Netlify ou CLI (conta Radio Ibiza):

```bash
cd sites/site-cliente
npx netlify sites:create --name radio-ibiza-site-cliente
npx netlify link   # escolher o site criado
```

**Base directory** (importante no painel Netlify → Site settings → Build):

- **Base directory:** `sites/site-cliente`
- **Build command:** *(vazio)*
- **Publish directory:** `public`

Ou deploy manual:

```bash
cd sites/site-cliente
npx netlify deploy --prod --dir=public
```

### 2. Domínio customizado

Netlify → Domain management → Add domain:

- `cliente.radioibiza.app.br`

DNS (exemplo):

| Tipo | Nome | Valor |
|------|------|--------|
| CNAME | cliente | `<site>.netlify.app` |

Ativar **HTTPS** (Let's Encrypt).

### 3. Variáveis no site **cliente** (Netlify)

Nenhuma secret no front estático Fase 1. Opcional:

| Variável | Valor |
|----------|--------|
| `SITE_CLIENTE_PORTAL_ORIGIN` | `https://portal.radioibiza.app.br` |

*(Só documentação/build futuro; proxy está fixo no `netlify.toml`.)*

---

## Variáveis no **portal** (obrigatórias com site separado)

Configurar em **portal.radioibiza.app.br** → Netlify → Environment variables:

| Variável | Exemplo | Uso |
|----------|---------|-----|
| `SITE_CLIENTE_PUBLIC_ORIGIN` | `https://cliente.radioibiza.app.br` | Cookie `site_cliente_session` no domínio certo após login via proxy |
| `SITE_CLIENTE_COOKIE_DOMAIN` | `cliente.radioibiza.app.br` | Alternativa explícita ao cookie (se proxy não repassar Host) |
| `PORTAL_SESSION_SECRET` | *(já existe, ≥32 chars)* | JWT site cliente (mesmo secret hoje; futuro: secret dedicado) |

**Após adicionar:** redeploy do portal.

---

## Segurança (pentest / produção)

### Já implementado

- Cookie **httpOnly**, **Secure**, **SameSite=Lax**
- JWT com claim `typ: "site_cliente"` (≠ portal)
- Rate limit login: **20 tentativas / 15 min / IP**
- APIs autenticadas exigem sessão + **escopo grupo** + **permissões granulares**
- Admin `/api/suporte/site-clientes/*` exige **sessão portal** (staff)
- CSP / X-Frame-Options no site cliente
- Proxy API — browser same-origin (sem CORS exposto)

### Checklist antes de dados sensíveis (boletos)

- [ ] 2FA (Google Authenticator) para usuários com `verCobranca`
- [ ] Secret dedicado `SITE_CLIENTE_SESSION_SECRET` (separar do portal)
- [ ] Redirect 301 no portal: `/site-cliente/*` → `cliente.radioibiza.app.br`
- [ ] Audit log: login, download boleto, export PDF
- [ ] Pentest: IDOR (trocar `rioLinhaId` na URL), brute force, CSRF (cookie SameSite)
- [ ] Não expor `/api/site-cliente/*` sem auth except login/logout

### O que nunca fazer

- Colocar `DATABASE_URL` ou tokens Conta Azul no site cliente
- Reutilizar cookie `portal_session` no site cliente
- Deploy do site cliente a partir do mesmo build do portal sem isolar rotas

---

## Fases

| Fase | Entrega |
|------|---------|
| **1** (agora) | Netlify + domínio + login estático + proxy API |
| **2** (agora) | Dashboard estático em `cliente.radioibiza.app.br/app` + redirect pós-login |
| **3** | 301 portal `/site-cliente` → domínio novo; limpar middleware portal |
| **4** | Cobrança/boletos + 2FA + pentest formal |

---

## Teste pós-deploy

1. Abrir `https://cliente.radioibiza.app.br`
2. Entrar com usuário criado em Suporte → Site clientes
3. DevTools → Application → Cookies → `site_cliente_session` em **cliente.*** 
4. Confirmar portal `/login` staff **não** afetado

---

## Rollback

- Remover CNAME `cliente` ou apontar site Netlify para página em manutenção
- Clientes voltam temporariamente a `portal.radioibiza.app.br/site-cliente/login`
- Remover `SITE_CLIENTE_PUBLIC_ORIGIN` do portal se necessário
