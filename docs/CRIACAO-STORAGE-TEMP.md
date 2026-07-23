# Armazenamento temporário vs canônico (cloud2 / Criação)

## Ideia

Cada **etapa transitória** do áudio usa **uma pasta própria** sob `CRIACAO_STORAGE_ROOT`. Quando o processo termina com sucesso (ou após retention em erro), o worker **apaga** o scratch daquela etapa. O que **não** é temp não entra nessa regra.

Isso já é o desenho atual; este doc nomeia as pastas e como monitorar **limbo** (arquivo parado na temp por muitos dias).

## Pastas temporárias (scratch)

| Pasta | Processo | Limpeza normal |
|--------|-----------|----------------|
| `upload/` | MP3 bruto da fila / ingest | `cleanupAfterItemPersisted`, GC após concluído/erro (48h default) |
| `download-staging/` | Deemix / Spotizerr / YT | Após `ingest-from-staging`, GC de imports concluídos e órfãos |
| `work/{itemId}/` | FFmpeg, mix, intermediários | `cleanupProcessamentoItemScratch`, GC se não `processando` |

Definições em código: `.cloud2-stage/criacao/tempStorageBuckets.ts`.

## Pastas canônicas (não são temp)

| Pasta | Papel |
|--------|--------|
| `uso/musicas/` | 128 mono / .rib para player e preview |
| `master-local/` | Master 192k se B2 off |
| `vinheta/`, `vinheta-trilha/` | Spots (hoje sem delete automático ao apagar vinheta no portal) |
| **B2** `masters/` | Master frio em produção |

Apagar da biblioteca mira `uso/` + master (local/B2), não o HD legado (Servidor UP).

## Limbo (> X dias na temp)

Variável: **`CRIACAO_TEMP_LIMBO_DAYS`** (default **7**).

O relatório **`GET /criacao/ops/orphans`** (secret ingest) inclui:

- `tempBuckets` — mapa das pastas temp
- `tempLimbo` — arquivos/pastas com **mtime** mais antigo que X dias (amostra até 100)
- `buckets` — órfãos lógicos (sem linha Neon / status terminal)

**Órfão** = provavelmente sobra de lógica. **Limbo** = parado na temp há tempo (pode ainda ter linha «aguardando» presa).

GC automático: worker a cada ~5 min (`runStorageGarbageCollect`).

## Operação

```bash
# Com CRIACAO_INGEST_SECRET no ambiente
curl -s -H "x-criacao-secret: …" https://cloud2.radioibiza.app.br/criacao/ops/orphans | jq '.tempLimbo,.warnings'
```

Portal: **Config → Servidores** (quando `/ops/storage` estiver exposto na UI).

### Backblaze B2 no painel «Servidores»

O espaço do bucket vem de `GET /criacao/ops/storage` no **container api** do cloud2 (não só no worker-audio).

Variáveis no `.env` do compose (**api** e **worker-audio**):

| Variável | Exemplo |
|----------|---------|
| `B2_S3_ENDPOINT` ou `B2_ENDPOINT` | `https://s3.us-west-002.backblazeb2.com` |
| `B2_REGION` | `us-west-002` |
| `B2_BUCKET` | nome do bucket |
| `B2_KEY_ID` | Application Key ID |
| `B2_APPLICATION_KEY` | secret da key (list + read + write) |

Depois: `docker compose up -d api worker-audio`. No Netlify: `CRIACAO_INGEST_SECRET` igual ao cloud2.

Se o worker sobe master no B2 mas o card fica offline, quase sempre falta repassar as mesmas `B2_*` para o serviço **api**.

Limpeza manual (cuidado):

- `POST /criacao/cleanup/gc`
- `POST /criacao/cleanup/download-staging`

## Escala (milhares de faixas)

- Temp deve **oscilar perto de zero** entre picos de upload; limbo crescente = GC parado ou fila travada.
- Crescimento linear esperado: **`uso/` + B2 masters**, não `upload/`/`work/`.
- Próximos passos opcionais: lifecycle no B2, delete R2/vinheta, TTL `ping_log`, não duplicar pastas temp (só disciplina + monitor).
