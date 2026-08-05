# Servidor UP — segundo plano (após Match)

## Papel humano vs automático

| Etapa | Onde | Precisa de você? |
|---|---|---|
| Scan / fingerprints | Agente local (Mac) | Só iniciar |
| Hierarquia + dedupe | Portal | Não (revisar se órfãos) |
| **Match Deemix** | Portal | **Sim** — revisar / escolher / pular |
| Deemix download | cloud2 + portal job | Não |
| Fila Criação + pastas | night-worker | Não |

Depois de **Entregar N faixa(s)**, o portal só cria o job Deemix, grava o snapshot (`autoEnqueueFila: true`) e dá um kick no worker. **Pode fechar a aba** — a sessão de 8h do portal não precisa ficar viva.

## Cron (automático no Netlify)

**Deploy em produção** inclui a scheduled function `servidor-up-night-worker` (a cada 5 min), configurada em `netlify.toml` + `netlify/functions/servidor-up-night-worker.mts`.

Ela chama internamente `POST /api/criacao/servidor-up/night-worker` com Bearer — **precisa** de uma destas variáveis no Netlify (≥16 caracteres):

- `OC_EMAIL_CRON_SECRET` (se já usa o cron de e-mail OC), ou
- `CRON_SECRET`

**Importante:** o cron processa **todos os snapshots Servidor UP pendentes** (até 10 por tick, 12 faixas cada). Opcional: `SERVIDOR_UP_NIGHT_WORKER_JOB_ID` limita a um job (homolog). O browser sempre manda `downloadJobId` no kick manual.

No painel Netlify: **Site → Environment variables**. Depois do próximo deploy, em **Functions** deve aparecer `servidor-up-night-worker` com badge **Scheduled** e botão **Run now** para testar.

### Manual (alternativa)

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://SEU_PORTAL/api/criacao/servidor-up/night-worker?downloadLimit=20"
```

### GitHub Actions (opcional)

Arquivo local `.github/workflows/servidor-up-night-worker.yml` — só se quiser cron fora do Netlify; push exige PAT com scope **workflow**.

## O que o night-worker faz

1. Dispara processamento Deemix pendente (até 2 passes por tick)
2. Para cada snapshot Servidor UP com `autoEnqueueFila`:
   - enfileira chunks na fila Criação
   - recover de faixas faltantes + staging

## Rollback

Desative o workflow no GitHub Actions ou remova os secrets. O botão **Acelerar agora** no passo 3 ainda faz kick manual com sessão logada.
