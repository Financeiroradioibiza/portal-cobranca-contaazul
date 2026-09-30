# PWA Chamados + Web Push

Experiência mobile em **`/m/chamados`** (e opcionalmente **`chamados.radioibiza.app.br`** → redireciona para `/m/chamados`).

## iOS (usuários atuais)

1. Abrir **`https://portal.radioibiza.app.br/m/chamados`** no Safari (logado).
2. **Compartilhar → Adicionar à Tela de Início**.
3. Abrir o ícone **Chamados** na tela inicial.
4. Tocar **Ativar notificações** (Web Push exige app instalado — iOS 16.4+).

## Variáveis (Netlify + `.env.local`)

Gerar par de chaves:

```bash
node scripts/generate-vapid-keys.mjs
```

| Variável | Descrição |
|----------|-----------|
| `PUSH_VAPID_PUBLIC_KEY` | Chave pública (exposta ao browser via `/api/push/vapid-public-key`) |
| `PUSH_VAPID_PRIVATE_KEY` | Segredo servidor — **nunca** no client |
| `PUSH_VAPID_SUBJECT` | `mailto:chamados@radioibiza.com.br` ou URL do site |

Sem VAPID, e-mail de chamados continua; push fica desligado (503 no subscribe).

## Banco

Migration `portal_push_subscription` — após deploy:

```bash
npx prisma migrate deploy
```

## Subdomínio (opcional)

No Netlify, adicionar domínio **`chamados.radioibiza.app.br`** no **mesmo** site do portal. O middleware redireciona `/` → `/m/chamados`. Cookie de sessão segue o host (mesmo site = OK).

## Arquivos

- Manifest: `public/chamados.webmanifest`
- Service worker: `public/chamados-sw.js`
- Ícones: `public/chamados-icon-*.png`
- APIs: `app/api/push/*`
- Envio: `lib/push/sendPush.ts` (paralelo ao SMTP em `chamadoNotifyEmail` / `conversaNotifyEmail`)
