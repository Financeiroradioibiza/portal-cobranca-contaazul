# Instalação 8 — Microsoft Store (módulo isolado)

Painel: **Suporte → Instalação** → tipo **8 · Microsoft Store** (`/suporte/instalacao`).

API portal: `POST /api/suporte/microsoft-store` (gerar MS8, e-mail).  
Player: `https://msplayer5.radioibiza.app.br/instalar-msstore?ibiza_app=msstore`.

## Regras

- **Não** alterar fluxos Instalação 1–7, `loginPlayInstalacao` / PL5.
- MS8 → tabela **`pdv_instalacao_msstore_codigo`** (migration `20261008193000_instalacao_msstore_codigo`).

## Deploy (ordem)

1. **Neon:** `npx prisma migrate deploy` (tabela MS8).
2. **Portal Netlify:** deploy com esta pasta + página + API.
3. **Cloud2:** `.cloud2-stage/webservice/loginMsStoreInstalacao.js` + registo em `webservice-index.ts` → deploy API produção.
4. Validar: `POST https://cloud2.radioibiza.app.br/api/loginMsStoreInstalacao/` com código inválido → `{ "mensagem": "codigo_invalido" }` (não 404).

Env opcional: `MSSTORE_PLAYER_PUBLIC_ORIGIN=https://msplayer5.radioibiza.app.br`.

## Player / Store

`radio-ibiza-player-5/microsoftstore/` + `CHECKLIST-FASE-B.md` (PWABuilder / MSIX).
