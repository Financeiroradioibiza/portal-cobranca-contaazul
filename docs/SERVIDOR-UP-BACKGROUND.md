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

## Cron

Endpoint: `POST|GET /api/criacao/servidor-up/night-worker?downloadLimit=20`  
Auth: `Authorization: Bearer <CRON_SECRET>` (ou `OC_EMAIL_CRON_SECRET`, ≥16 chars). Também aceita cookie de sessão do portal.

Intervalo sugerido: **a cada 5 minutos**.

### Opção A — curl / cron-job.org / EasyCron

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://SEU_PORTAL/api/criacao/servidor-up/night-worker?downloadLimit=20"
```

### Opção B — GitHub Actions

Arquivo pronto em `.github/workflows/servidor-up-night-worker.yml` (pode estar só local se o token Git sem scope `workflow`). Secrets do repo:

- `PORTAL_BASE_URL` — URL pública do portal (sem barra final)
- `CRON_SECRET` — igual ao Netlify

Push do workflow exige PAT com scope **workflow**.

## O que o night-worker faz

1. Dispara processamento Deemix pendente (até 2 passes por tick)
2. Para cada snapshot Servidor UP com `autoEnqueueFila`:
   - enfileira chunks na fila Criação
   - recover de faixas faltantes + staging

## Rollback

Desative o workflow no GitHub Actions ou remova os secrets. O botão **Acelerar agora** no passo 3 ainda faz kick manual com sessão logada.
