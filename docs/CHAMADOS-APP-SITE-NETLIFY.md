# Site app Chamados (`chamados.radioibiza.app.br`)

Produto **separado** do portal desktop e do shell `/m` — só kanban + chat `#`, mobile-first.

## O que é

| Item | Detalhe |
|------|---------|
| Código | `sites/chamados-app/public/` (HTML/CSS/JS estático) |
| Deploy | **Novo site Netlify** (não é o mesmo build Next do portal) |
| Dados | APIs existentes em `portal.radioibiza.app.br` via proxy |
| Player | **Nenhuma** ligação |

## Criar o site na Netlify

1. **Add new site** → Import do mesmo repo GitHub.
2. **Base directory:** `sites/chamados-app`
3. **Build command:** vazio (ou `echo ok`)
4. **Publish directory:** `public`
5. **Desativar** plugin Next.js neste site (só estático).
6. **Domínio:** `chamados.radioibiza.app.br`
7. No **portal** (Next): variável opcional `NEXT_PUBLIC_CHAMADOS_APP_URL=https://chamados.radioibiza.app.br` (links de push).

Proxy já está em `sites/chamados-app/netlify.toml` (`/api/auth`, `/api/chamados`, `/api/push` → portal).

## Login

Mesmo usuário do portal (e-mail + senha + TOTP). O login devolve `sessionToken` para o app gravar (padrão igual site-cliente).

## PWA / push

Manifest e `sw.js` no app. VAPID continua no **portal** (Netlify do Next). Usuário iOS: instalar na tela inicial a partir de `chamados.radioibiza.app.br`.

## Local

Servir `sites/chamados-app/public` com qualquer static server; APIs precisam do proxy Netlify ou apontar manualmente para portal (CORS bloqueia fetch direto cross-origin sem proxy).

## Loop 308 em `/api/chamados` (Rede cheia de “chamados”)

**Causa:** o site **chamados-radioibiza** no Netlify está rodando **Next.js do portal** (plugin ou base directory na raiz do repo), não o estático em `sites/chamados-app`.

**Como confirmar:** abra `https://chamados.radioibiza.app.br/deploy-check.txt` — deve mostrar `chamados-app-static-ok`. Se der 404 ou página do portal, a config está errada.

**Corrigir no painel Netlify (site chamados-radioibiza):**

1. **Site configuration → Build & deploy → Build settings**
   - **Base directory:** `sites/chamados-app`
   - **Build command:** *(vazio)*
   - **Publish directory:** `public`
2. **Plugins:** remover **@netlify/plugin-nextjs** / framework **Next.js** neste site (deixar só **Static**).
3. **Deploys → Trigger deploy → Clear cache and deploy site.**

Depois, `curl -I https://chamados.radioibiza.app.br/api/chamados` deve retornar **401** JSON do portal (via proxy), **não** 308 com `x-nextjs` nos headers.
