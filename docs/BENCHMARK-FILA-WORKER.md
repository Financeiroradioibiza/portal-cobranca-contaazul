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
| CPU | **2 núcleos** → upgrade **8 vCPU** (jul/2026) |
| RAM | → upgrade **16 GB** |
| Disco | → upgrade **80 GB** |
| `CRIACAO_WORKER_CONCURRENCY` | **2** |
| Pipeline | dedupe → mix → LUFS → tags → B2 (master + uso 128) |

**Após resize Envyron:** reiniciar a VM (CPU/RAM só aparecem no painel Servidores depois do reboot). Opcional no `.env`: `CLOUD2_VM_CPU_COUNT=8` e `CLOUD2_VM_RAM_GB=16` até o SO refletir.

---

## Teste T1 — 2026-07-28 (bloco 1)

| Métrica | Valor |
|---------|-------|
| Data/hora | 2026-07-28 ~18:04 (captura Servidores) |
| Faixas | **46** |
| Origem | Servidor UP → Multi-Upload |
| Tempo total fila | **21 min 9 s** _(1269 s)_ ✓ confirmado |
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

## Teste T2 — pós-upgrade VM (43 faixas)

| Métrica | T1 (2 CPU) | T2 |
|---------|------------|-----|
| Faixas | 46 | **43** |
| Tempo total | 21:09 | **17:30** |
| s/faixa efetivo | ~27,6 | **~24,4** |
| Concorrência | 2 | **2** |
| CPU pico | 106% | _(anotar)_ |
| RAM pico | — | _(anotar)_ |

Throughput ~**13%** maior que T1. VM upgrade + reboot; worker ainda em concorrência 2.

---

## Teste T3 — concorrência 4 (41 faixas)

| Métrica | T1 (2 CPU) | T2 | T3 |
|---------|------------|-----|-----|
| Faixas | 46 | 43 | **41** |
| Tempo total | 21:09 | 17:30 | **10:20** |
| s/faixa efetivo | ~27,6 | ~24,4 | **~15,1** |
| Concorrência | 2 | 2 | **4** |
| CPU pico | 106% | — | **~65%** (máx. ~55% sustentado) |
| RAM pico | — | — | **~12%** (~1 GB / 8 GB container) |
| Throughput | ~2,17 fx/min | ~2,46 | **~3,97 fx/min** |

Ganho T3 vs T2: **~41%** menos tempo total · **~38%** menos s/faixa.

---

## Teste T4 — concorrência 5 (46 faixas)

| Métrica | T1 | T3 (4 fx) | T4 |
|---------|-----|-----------|-----|
| Faixas | 46 | 41 | **46** |
| Tempo total | 21:09 | 10:20 | **9:55** |
| s/faixa efetivo | ~27,6 | ~15,1 | **~12,9** |
| Concorrência | 2 | 4 | **5** |
| CPU pico | 106% | ~65% | **~66%** |
| RAM pico | — | ~12% | **~12,5%** |

T4 vs T1: **~53%** mais rápido. T4 vs T3 (normalizado 46 fx ≈ 11:36): **~15%** — ganho marginal 4→5 slots (esperado).

---

## Teste T5 — concorrência 7

| Métrica | T4 (5 fx) | T5 |
|---------|-----------|-----|
| Tempo total | 9:55 (46 fx) | **4:09** |
| Concorrência | 5 | **7** |
| CPU pico | ~66% | **110%** (estourou) |
| RAM pico | ~12,5% | **~12,6%** |

**Decisão:** voltar para **6** — melhor equilíbrio (rápido sem saturar CPU). RAM não é gargalo.

**Ago/2026:** CPU sustentada ~134% com fila ATL CRICA + 568 fx → **`5`** (`bash scripts/set-cloud2-worker-concurrency.sh 5`).

---

## Produção (ago/2026)

| `CRIACAO_WORKER_CONCURRENCY` | **5** |

---

## Produção (jul/2026 — histórico)

| `CRIACAO_WORKER_CONCURRENCY` | **6** |

---

## Teste T4 — pós-upgrade 8 vCPU (histórico)

_Agendar com Envyron após resize._

| Cenário | `CRIACAO_WORKER_CONCURRENCY` | Tempo 46 faixas | CPU pico | RAM pico | Notas |
|---------|------------------------------|-----------------|----------|----------|-------|
| A | 2 | 17:30 (43 fx) | | | T2 |
| B | 3 | | | | |
| C | 4 | | | | T3 |

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
