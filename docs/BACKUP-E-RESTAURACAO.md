# Backup e restauração — Radio Ibiza

Guia prático para não perder código, banco nem contexto do projeto.

**Data:** 28/05/2026

---

## 1. O que precisa estar protegido

| Camada | O quê | Onde |
|--------|-------|------|
| **Código portal** | `portal-cobranca-contaazul` | GitHub `Financeiroradioibiza/portal-cobranca-contaazul` |
| **Código player + API nova** | `playeribiza2015-2026` | **Só local hoje** — incluir no backup em disco |
| **Legado referência** | `radioibiza-legacy-www` | Local (extraído do zip) |
| **Banco portal** | Neon Postgres | Neon console + export |
| **Banco legado** | MySQL Cake | Digital Ocean — infra Envyron/DO |
| **Configs secretas** | `.env`, variáveis Netlify | Gestor de senhas — **nunca** no git |
| **CSV painel** | `data/export-clientes.csv` | Repo + redeploy quando atualizar |
| **Contexto** | `docs/ONDE-ESTAMOS.md` | Git |

---

## 2. Backup automático local (Mac)

```bash
cd ~/Documents/portal-cobranca-contaazul
bash scripts/backup-radio-ibiza-local.sh
```

Cria em `~/Documents/backups-radio-ibiza/` um `.tar.gz` com:

- `portal-cobranca-contaazul`
- `playeribiza2015-2026` (se existir)
- `radioibiza-legacy-www` (se existir)

Exclui `node_modules` e `.next`. Rode após marcos importantes.

---

## 3. Backup GitHub (código portal)

```bash
cd ~/Documents/portal-cobranca-contaazul
git add docs/
git commit -m "docs: registro onde estamos + guia backup"
git push origin main
```

Isso **não** substitui backup do Neon nem do `.env`.

---

## 4. Backup Neon (banco portal)

1. [console.neon.tech](https://console.neon.tech) → projeto do portal  
2. **Create branch** antes de migrations arriscadas  
3. Export opcional:

```bash
pg_dump "$DATABASE_URL_DIRECT" -Fc -f ~/Documents/backups-radio-ibiza/neon-portal-$(date +%Y%m%d).dump
```

Use connection string **direct** (não pooler). Guarde `.dump` fora do Mac.

---

## 5. Variáveis Netlify (backup manual)

Copiar do painel Netlify para gestor de senhas:

- `DATABASE_URL`
- `CONTA_AZUL_*`
- `PORTAL_SESSION_SECRET`, `PORTAL_USERS_JSON`
- `OC_EMAIL_*`, `RADIO_PAINEL_*`
- `OC_EMAIL_CRON_SECRET` / `CRON_SECRET`

---

## 6. Repositório player (recomendado)

`~/Documents/playeribiza2015-2026` **não** está no GitHub do portal. Opções:

1. Git privado para `portal-ibiza` + `radio-ibiza-player-4`  
2. Backup tar via script acima  
3. Disco externo / iCloud

---

## 7. Checklist rápido

```
[ ] git push main (portal-cobranca-contaazul)
[ ] bash scripts/backup-radio-ibiza-local.sh
[ ] Neon: branch snapshot ou pg_dump mensal
[ ] Netlify env vars no cofre de senhas
[ ] export-clientes.csv atualizado se mudou no painel
[ ] docs/ONDE-ESTAMOS.md revisado após marcos
```

---

## 8. Restauração de emergência

| Perda | Ação |
|-------|------|
| Mac | Clonar GitHub + restaurar tar + Neon branch/dump |
| Neon | Restaurar dump ou promote branch snapshot |
| Netlify | Reconectar repo + env vars + `prisma migrate deploy` |
| Contexto | Ler `docs/ONDE-ESTAMOS.md` |

---

*Nunca commitar `.env`.*
