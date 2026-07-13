<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Produção segura (Portal + Player + Cloud2)

Regra permanente do projeto: **não regredir player, cronogramas, sync ou logins em produção.**  
Detalhes: `.cursor/rules/producao-segura-player.mdc` — mudanças de risco no player/publicação exigem homologação ou OK explícito antes de deploy.
