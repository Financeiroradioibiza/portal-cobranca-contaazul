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
