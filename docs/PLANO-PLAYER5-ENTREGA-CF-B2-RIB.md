# Plano — Player 5: entrega via Cloudflare + B2 (`.rib` end-to-end)

**Status:** Fase A concluída; **Fase C implementada no repo** (jul/2026) — deploy cloud2 + Worker pendente.  
**Objetivo:** eliminar o proxy de áudio no cloud2 (B2 → Envyron → PDV) em escala (~4000 PDVs), **sem alterar** fila, pipeline, publicação, cronogramas, login, ping nem contratos operacionais já homologados.

Documentos irmãos:

- Baseline atual: `docs/BASELINE-PORTAL-PLAYER-ARMAZENAMENTO.md`
- B2 128 + verify: `docs/PLANO-B2-128-PASSOS.md`
- Rollback: `docs/FALLBACK-ARMAZENAMENTO-B2.md`
- Integração Player: `docs/PLAYER5-INTEGRACAO.md`

---

## Regra de ouro (não regredir)

> **Só mudamos o endereço de download das músicas (e certificados/TLS do domínio de entrega).**  
> **Nada mais.**

Qualquer PR desta fase que toque em dedupe, LUFS, mix, tags, publicar, cronogramas, vinhetas, sync PDV, login ou hierarquia de reprodução **está fora de escopo** e exige OK explícito separado (ver `.cursor/rules/producao-segura-player.mdc`).

---

## O que **NÃO** muda (intocável)

| Área | Comportamento permanece |
|------|-------------------------|
| **Fila Criação** | ingest → dedupe → mix → LUFS → tags → armazenamento (ordem fixa) |
| **Master 192** | B2 (`master/{id}.mp3`), verify HeadObject |
| **128 mono** | `.rib` (ou `.mp3` se secret ausente) — empacotamento `rib.ts` |
| **Neon** | `musica_biblioteca`, `musica_versao.storage_key`, tags, trim, mix |
| **Publicação** | `publicar.ts` copia metadados + `storage_key` para gateway |
| **Gateway PG** | `programas`, `playlists`, `musicas`, `playlist_musicas` — mesmo schema |
| **Player — controle** | login, loginByToken, getPdvs, ping, cronogramas, vinhetas, avisos, MIX, shuffle, cache de programação |
| **Portal preview** | Continua `cloud2/criacao/audio` (HMAC) — **fora deste pacote** |
| **Upload portal** | Continua direto `cloud2/criacao/ingest` (CORS já existente) |
| **Disparo atualização** | `atualizacao_pendente`, revision, snapshot — igual |
| **Player 5 atual (v1)** | Continua funcionando via `GET /api/get_musica/` até migração PDV a PDV |

---

## O que **muda** (escopo mínimo)

| Peça | Antes (v1) | Depois (v2, opt-in por build/PDV) |
|------|------------|-----------------------------------|
| **`url_musica` na `/api/playlist/`** | `{cloud2}/api/get_musica/?token=…` | URL **HTTPS assinada** para objeto **`.rib`** na borda Cloudflare (origin B2) |
| **Download no PDV** | cloud2 faz proxy (decrypt + stream MP3) | PDV baixa **`.rib`**, grava **`.rib`** no cache local |
| **Reprodução** | MP3 recebido do cloud2 | Descriptografa **`.rib` só em memória** na hora do play |
| **Tráfego Envyron (áudio)** | ~2× tamanho da faixa (B2→cloud2→PDV) | **Zero** bytes de MP3/rib no proxy (cloud2 só JSON de playlist) |
| **Certificados** | TLS cloud2 | TLS **`cloud3.radioibiza.app.br`** (CF) |

**cloud2 continua mandando** login, playlist, ping e validação — só deixa de ser CDN de áudio para PDVs v2.

---

## Arquitetura alvo

```
┌─────────────────────────────────────────────────────────────────────────┐
│  INTocável — mesmos processos de sempre                                  │
│  Portal → Fila → Pipeline → B2 (master + .rib) → Publicar → Gateway PG  │
└─────────────────────────────────────────────────────────────────────────┘

  Armazenamento canônico (já homologado)
  ┌──────────────────────┐
  │ Backblaze B2         │  master/192 + uso/…/*.rib
  │ (arquivo da verdade) │
  └──────────┬───────────┘
             │  Bandwidth Alliance (B2 → Cloudflare, sem egress B2 nesta perna)
             ▼
  ┌──────────────────────┐
  │ Cloudflare           │  CDN / cache de borda + domínio de entrega
  │ (só entrega quente)  │  URL assinada, TTL curto — bucket não público aberto
  └──────────┬───────────┘
             │  HTTPS — objeto .rib
             ▼
  ┌──────────────────────┐
  │ Player 5 v2 (PDV)    │  cache em disco = .rib
  │                      │  decrypt AES-GCM em RAM → Audio (sem gravar MP3)
  └──────────────────────┘

  cloud2 (Envyron) — só controle para v2
  ┌──────────────────────┐
  │ /api/playlist/       │  emite url_musica assinada (após validar token PDV)
  │ login, ping, agendas │  inalterados
  └──────────────────────┘
```

### Por que Cloudflare + B2 (e não só B2 direto no player)

- **Bandwidth Alliance:** egress B2 → Cloudflare sem custo de B2 nessa perna.
- **Cache na borda:** com ~4000 PDVs e playlists repetidas, a maioria dos hits fica na CF — menos carga no origin.
- **Um lugar** para TLS, WAF, analytics e regras de cache no domínio de áudio.
- **R2 opcional depois:** se quiser 128 100% dentro da CF, espelha `.rib` B2→R2 — **fase posterior**, não bloqueia a v2.

### Por que player descriptografa (e não Worker na borda)

Requisito de produto: **transferência e cache do cliente = `.rib`**, nunca MP3 solto.

| Abordagem | Transfer | Cache PDV | Veredicto |
|-----------|----------|-----------|-----------|
| cloud2 proxy (hoje) | MP3 | MP3 | Ok homolog; caro em escala |
| CF Worker decrypt | MP3 | MP3 | ❌ quebra requisito |
| Player decrypt | `.rib` | `.rib` | ✅ alinhado |

Desempenho: decrypt ~4 MB AES-GCM ≈ dezenas de ms — irrelevante vs rede. Portar `rib.ts` (~50 linhas) para Web Crypto / nativo.

---

## Contrato Player 5 v2 (só o que muda na playlist)

### v1 (atual — mantido para sempre até sunset explícito)

```http
url_musica: https://cloud2.radioibiza.app.br/api/get_musica/?token=…&id_musica=…&playlist_id=…
```

### v2 (opt-in)

```http
url_musica: https://cloud3.radioibiza.app.br/…/mp3_128_mono.rib?…assinatura…&exp=…
```

Regras:

1. **Mesmos campos** na playlist (`titulo`, `corte`, `duracao`, `downloaded`, etc.) — só `url_musica` muda de host/path.
2. Player v2 detecta URL de entrega CF (host configurável no build) vs `get_musica` — **fallback automático** se URL antiga.
3. Cache local: arquivo **`.rib`** (mesmo nome lógico / hash de id).
4. Secret: derivado de `CRIACAO_RIB_SECRET` embarcado ofuscado no app (honest-client DRM — impede MP3 casual na pasta cache).

### Geração da URL (cloud2)

- Endpoint existente **`/api/playlist/`** — lógica **aditiva**:
  - Se PDV/cliente flag **v2** (campo gateway ou header de versão no ping): gera presigned / token CF por faixa.
  - Senão: **`url_musica` legacy** (`get_musica`) — **zero regressão**.
- Validação de token PDV **antes** de emitir URL — bucket nunca público listável.

---

## Fases de implementação (sem big-bang)

### Fase A — Infra Cloudflare (sem mudar player)

Runbook: **`docs/FASE-A-CF-AUDIO-SETUP.md`** · Worker: `cloudflare/audio-b2/`

- [ ] Conta / zona DNS (`radioibiza.app.br`).
- [ ] Subdomínio entrega (ex. `cloud3.radioibiza.app.br`).
- [ ] CDN / pull zone apontando origin B2 (`B2_USO_PREFIX`) — Bandwidth Alliance configurada.
- [ ] CORS no bucket B2 (origins: `player5.radioibiza.app.br`, TWA se aplicável).
- [ ] Certificado TLS na CF.
- **Player e playlist:** inalterados. Homolog: HEAD no objeto `.rib` via domínio CF (ops).

### Fase B — Pipeline (aditivo, flag off por default)

- [ ] Garantir todo 128 novo continua `.rib` + B2 (já é o caso com `CRIACAO_USO_B2=1`).
- [ ] **Não** reintroduzir dependência de disco `uso/` (`CRIACAO_USO_DISK_MIRROR=0` ok).
- [ ] (Opcional fase B) Espelho R2 desacoplado de `DISK_MIRROR` — só se opt-in `R2_*` + flag nova; **não obrigatório** para v2 com B2+CDN.
- **Nenhuma mudança** em dedupe, tags, publicar, cronogramas.

### Fase C — cloud2 presign na playlist (flag `PLAYER5_ENTREGA_CF=0` default)

- [x] Função presign B2/CF — `.cloud2-stage/criacao/cfAudioUrl.ts` + Worker `exp`/`sig`
- [x] Campo/flag por PDV (`PLAYER5_ENTREGA_CF_PDV_IDS`) ou `PLAYER5_CF_MIN_VERSION` no ping
- [x] **`get_musica` permanece** para v1 e fallback
- [ ] Homolog **1 PDV** com build v2 (Fase D); demais continuam v1

### Fase D — Player 5 v2 build

- [ ] Download `.rib` da URL CF.
- [ ] Cache `.rib` (filesystem / IndexedDB — igual política de cache atual, extensão `.rib`).
- [ ] `decryptRib()` portado — play from memory buffer.
- [ ] Fallback: se URL é `get_musica`, comportamento v1 intacto.
- [ ] Piloto → rollout gradual → métricas egress Envyron (deve cair).

### Fase E — Escala (4000 PDVs)

- [ ] Monitor cache hit CF, egress B2, erros 403/expired URL.
- [ ] Ajuste TTL assinatura vs tempo de sync/download em lote.
- [ ] Sunset proxy cloud2 **somente** quando v1 < limiar acordado + OK Rafael.

---

## Variáveis de ambiente (novas — todas opt-in)

Adicionar em `docs/CLOUD2-ENV-OBRIGATORIO.md` quando implementar. **Defaults preservam comportamento atual.**

| Variável | Default | Efeito |
|----------|---------|--------|
| `PLAYER5_ENTREGA_CF` | `0` | `1` = playlist pode emitir URL CF para PDVs v2 |
| `CF_AUDIO_DOMAIN` | vazio | ex. **`cloud3.radioibiza.app.br`** |
| `CF_AUDIO_SIGN_TTL_SEC` | `3600` | validade URL assinada |
| `B2_USO_PUBLIC_BASE` | vazio | base URL origin (se diferente do domínio CF) |

**Não alterar** defaults de: `CRIACAO_USO_B2`, `CRIACAO_USO_DISK_MIRROR`, `CRIACAO_RIB_SECRET`, `B2_*` existentes.

---

## Rollback (instantâneo, sem redeploy player)

1. `PLAYER5_ENTREGA_CF=0` no cloud2 → playlist volta 100% `get_musica`.
2. PDVs v1 nunca souberam da mudança; PDVs v2 com fallback `get_musica` continuam tocando.
3. B2 e `.rib` no bucket **inalterados** — nada a reprocessar.
4. Detalhes adicionais: `docs/FALLBACK-ARMAZENAMENTO-B2.md`.

---

## Checklist “não quebramos nada?”

Antes de cada deploy desta linha:

- [ ] Fila teste: upload → dedupe → LUFS → B2 master + `.rib` → tag → `pronta`
- [ ] Preview portal `/criacao/audio` (cloud2) — inalterado
- [ ] Publicar programação → gateway `storage_key` copiado
- [ ] **Player v1** PDV piloto: login → playlist → `get_musica` → play
- [ ] Cronograma + vinheta + ping + atualização pendente
- [ ] Player v2 (se flag on): mesma programação, URL CF, cache `.rib`, play
- [ ] Republicar programação antiga **sem** exigir re-upload de faixas

---

## Decisões explícitas (registro)

| Decisão | Escolha |
|---------|---------|
| Formato em trânsito e cache | **`.rib`** sempre |
| Quem descriptografa no PDV | **Player** (memória only) |
| Origin do arquivo | **B2** canônico |
| Borda / cache / TLS | **Cloudflare** |
| cloud2 como proxy de áudio | **Manter v1**; retirar só após sunset v1 |
| Escopo de mudança | **Só URL + cert entrega**; processos intocados |

---

## Próximo passo sugerido

1. Rafael OK deste doc.  
2. Fase A (infra CF + domínio) — **zero impacto produção**.  
3. Issue/branch `feat/player5-entrega-cf` — cloud2 presign + Player v2 em paralelo, homolog 1 PDV.

---

*Atualizar este doc a cada marco (A→E). Qualquer desvio de escopo exige revisão explícita.*
