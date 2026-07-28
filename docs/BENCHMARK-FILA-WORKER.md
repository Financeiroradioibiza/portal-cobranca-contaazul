# Benchmark — fila de processamento (worker cloud2)

Registro de testes de carga para calibrar `CRIACAO_WORKER_CONCURRENCY` e dimensionamento VM (Envyron).

## Como medir

| Campo | Onde pegar |
|-------|------------|
| **Faixas** | Título do job / Multi-Upload |
| **Tempo total** | Início da fila → último item `concluido` |
| **MB entrada** | Soma `size_bytes` dos `processamento_item` ou Deemix staging |
| **Concorrência** | `CRIACAO_WORKER_CONCURRENCY` no `.env` Envyron |
| **CPU/RAM no pico** | Config → Servidores → Capacidade cloud2 |
| **Fila no pico** | `N processando · M aguardando` no mesmo painel |

**Fórmulas:**

- Tempo médio efetivo/faixa ≈ `tempo_total_seg ÷ faixas`
- Com concorrência `C`: tempo teórico ≈ `(faixas ÷ C) × tempo_médio_por_slot`
- Throughput ≈ `faixas ÷ (tempo_total_min)` faixas/min

---

## Hardware atual (baseline)

| Item | Valor |
|------|-------|
| VM cloud2 | Envyron |
| CPU | **2 núcleos** |
| RAM | _(anotar após painel Servidores mostrar memória)_ |
| `CRIACAO_WORKER_CONCURRENCY` | **2** |
| Pipeline | dedupe → mix → LUFS → tags → B2 (master + uso 128) |

**Upgrade proposto Envyron:** 4 CPU + mais RAM.

---

## Teste T1 — 2026-07-28 (bloco 1)

| Métrica | Valor |
|---------|-------|
| Data/hora | 2026-07-28 ~18:04 (captura Servidores) |
| Faixas | **46** |
| Origem | Servidor UP → Multi-Upload |
| Tempo total fila | **21 min 9 s** _(1269 s)_ — confirmar se não foi outro intervalo |
| Tempo médio efetivo | **~27,6 s/faixa** (1269 ÷ 46) |
| MB entrada (est.) | **~350–460 MB** (46 × MP3 Deemix ~320 kbps, ~8–10 MB/faixa) — conferir no job |
| Concorrência worker | **2** |
| Erros na fila | _(anotar se houve)_ |

### Snapshot Servidores (durante processamento)

| Métrica | Valor |
|---------|-------|
| CPU load | **106%** (load **2,12** / **2** núcleos) |
| Status | **CRÍTICO** — “Load da VM muito alto” |
| Disco NVMe | **41,8%** |
| Fila | **2 processando · 3 aguardando** |
| Faixas concluídas (total histórico) | 805 |

### Conclusão T1

- Com **2 núcleos** e concorrência **2**, a CPU ficou **saturada** (load > 2,0).
- Subir para concorrência **3** neste hardware **provavelmente não ajuda** — já no teto de CPU.
- **Recomendação:** upgrade **4 CPU** (Envyron) → testar concorrência **3** ou **4** no bloco 2.

---

## Teste T2 — (próximo bloco, ~46 faixas)

_Preencher após o segundo lote._

| Métrica | T1 (2 CPU) | T2 |
|---------|------------|-----|
| Faixas | 46 | |
| Tempo total | 21:09 | |
| s/faixa efetivo | ~27,6 | |
| Concorrência | 2 | |
| CPU pico | 106% | |
| RAM pico | — | |
| Erros | | |

---

## Teste T3 — pós-upgrade 4 CPU

_Agendar com Envyron após resize._

| Cenário | `CRIACAO_WORKER_CONCURRENCY` | Tempo 46 faixas | CPU pico | RAM pico | Notas |
|---------|------------------------------|-----------------|----------|----------|-------|
| A | 2 | | | | baseline pós-upgrade |
| B | 3 | | | | |
| C | 4 | | | | |

**Como aplicar concorrência:**

```bash
# /opt/portal-ibiza/infra/.env
CRIACAO_WORKER_CONCURRENCY=3

cd /opt/portal-ibiza/infra && docker compose up -d worker-audio
```

Confirmar no log: `"concurrency":3`.

---

## Critérios de sucesso / parar

| Sinal | Ação |
|-------|------|
| Tempo total cai ≥20% vs teste anterior | Manter concorrência |
| CPU load < 85% sustentado | Pode testar +1 concorrência |
| RAM > 90% ou OOM | Não subir; pedir mais RAM |
| Erros ffmpeg / itens presos em `processando` | Voltar concorrência anterior |

---

## Referências

- `docs/CLOUD2-ENV-OBRIGATORIO.md` — `CRIACAO_WORKER_CONCURRENCY`
- `docs/CRIACAO-PROCESSAMENTO-MUSICAL.md` — pipeline e escala
- Config → **Servidores** — CPU, RAM, fila ao vivo
