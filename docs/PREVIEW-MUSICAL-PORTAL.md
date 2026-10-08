# Preview musical no portal

App Vite em `sites/preview-musical/` (origem: `player-preview-2026` / preview.radioibiza.com.br).

## Onde abre no portal

- **Criação → Preview musical** (`/criacao/preview-musical`) — iframe em `/preview-musical/`
- **Player do cliente (público, sem login portal):** `/preview-musical/player/IBZ-XXXXX`
- **Admin Supabase:** `/preview-musical/admin` — exige login do portal **e** credenciais Supabase (como no Netlify)

## Build (Netlify / local)

Variáveis iguais ao site standalone:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

```bash
export VITE_SUPABASE_URL=...
export VITE_SUPABASE_ANON_KEY=...
npm run build:preview-musical
```

O artefato vai para `public/preview-musical/` (gerado; não versionar).

## Próximos passos (prod Radio Ibiza)

- Opcional: amarrar preview a cliente/PDV do dashboard de produção (Neon).
- Manter ou desligar `preview.radioibiza.com.br` após homologar no domínio principal.
