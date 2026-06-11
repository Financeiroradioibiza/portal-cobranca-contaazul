# Fase 2 — Produção musical como coração do sistema

Documento de visão e arquitetura para a próxima fase, após concluir a organização manual da coluna **Produção** (Cadastros → Rio × Produção).

**Data:** 2026-05-28  
**Status:** planejamento — não implementar automaticamente o que está marcado como *futuro*  
**Produção atual:** https://site-vencidos-ibiza.netlify.app

---

## 1. Norte estratégico

A **Produção musical** deixa de ser um espelho editável da Planilha Rio e passa a ser o **banco de dados operacional e o coração** de todo o fluxo de produção/criação:

- Cadastro de PDVs (endereço, contatos, programação, flags de player)
- Agrupamento editorial (HERINGTODAS, Maria Filo, grupos manuais)
- Estado de vida do ponto (`entrada` / `estável` / `saída`) reagindo à Rio
- Sinais financeiros vindos da Conta Azul (inadimplência, contratos, cobrança)
- **Webservice para players** — substituindo o painel Cake legado, com **compatibilidade retroativa** para ~4.000 players já conectados

O painel legado (`painel.radioibiza.com.br`) foi útil na **migração inicial** (import CSV, vínculos Rio × painel). Na Fase 2 ele é **transposto** para esta stack — mesmas responsabilidades, paths e contratos de conexão que os players esperam, implementados com tecnologia atual.

---

## 2. Estado atual (Fase 1 — em curso)

### O que já existe no portal

| Peça | Tabela / módulo | Papel hoje |
|------|-----------------|------------|
| Planilha Rio | `rio_comp_*` | Fonte de clientes/PDVs por competência; `movimento` entrada/saída/estável na virada/sync |
| Layout Produção | `cadastro_producao_layout` | Nomes editados, arrastes (`pdv_placements`), grupos custom (`custom_clientes`), ocultos |
| Cadastro PDV produção | `producao_pdv_cadastro` | Endereço, contatos loja, programação, `controlar_player`, `status_player`, etc. |
| Vínculo migração | `painel_pdv_link` | Ponte temporária Rio PDV ↔ `painel_pdv_id` legado; import one-shot do cadastro painel |
| Consulta painel | `lib/radioPainel/*`, `POST /api/radio-painel/query` | Scraping/login Cake — **não** é o webservice dos players |
| Movimento produção | `lib/cadastros/producaoMovimento.ts` | Lógica pronta; UI topo (`PRODUCAO_MOVIMENTO_TOP_ENABLED = false`) até organização estabilizar |

### Princípios já acordados (manter na Fase 2)

1. **Nunca reorganizar grupos automaticamente** — HERINGTODAS, Maria Filo e arrastes manuais só mudam por ação explícita do usuário ou por regra documentada na virada de mês.
2. **Remapear IDs, não descartar layout** — quando Rio recria linha/PDV ou `linha:{id}` vira PDV real, `pdv_placements` reatacha via `caPersonId` / proxy, sem perder destino editorial.
3. **Vínculos painel = ponte de migração** — criar cliente novo não deve depender do painel no longo prazo; import automático foi conveniência inicial.
4. **Rio manda entrada/saída; Produção reage** — Produção não inventa movimento; consome `rio_comp_cliente_linha.movimento` e `rio_comp_pdv.movimento`.

---

## 3. Objetivos da Fase 2

### 3.1 Produção inquebrável

- Layout editorial **persiste** entre reload, sync CA, vínculos e virada de mês.
- Toda mutação relevante é **auditável** (quem, quando, competência).
- Falha parcial (sync, API CA) **não** corrompe `cadastro_producao_layout` nem `producao_pdv_cadastro`.
- Testes de regressão para: remapeamento de IDs, multi-arraste, grupos custom, HERINGTODAS.

### 3.2 Responsividade à Planilha Rio

```
Planilha Rio (rio_comp_*)
        │
        │  sync / virada / import
        ▼
   Eventos de movimento
   (entrada | estável | saída)
        │
        ├─► Coluna Produção (banners, filas — quando ativado)
        ├─► Cadastro PDV (status player, flags)
        └─► Webservice players (playlist, autorização de tocar)
```

**Comportamento desejado:**

| Movimento Rio | Efeito na Produção (proposto) |
|---------------|-------------------------------|
| `entrada` | PDV aparece em «Novos na produção» até posicionado/ack; player pode nascer `Inativo` até cadastro completo |
| `estavel` | Fluxo normal; webservice serve configuração vigente |
| `saida` | PDV em «Encerrados»; `status_player → Inativo`; player deixa de receber playlist ativa (grace period configurável) |

Ativar `PRODUCAO_MOVIMENTO_TOP_ENABLED` somente quando a organização editorial estiver estável e as regras acima estiverem implementadas.

### 3.3 Enriquecimento Conta Azul (além da Rio)

Dados que **não** vêm da planilha mas devem **decorar** a Produção e influenciar operação:

| Sinal CA | Uso na Produção |
|----------|-----------------|
| Parcelas vencidas / em aberto | Badge «inadimplente» no PDV/cliente; opcional: restringir player ou playlist premium |
| Contratos ativos | Já em `contratos_ativos_texto` na linha Rio; exibir e cruzar com status player |
| E-mail / documento | Contato cobrança (já separado de contato loja no drawer) |
| Observações CA | Notas operacionais visíveis na produção |

**Regra:** Rio continua dona da **existência** do ponto (entrada/saída); CA é **camada financeira/comercial** — nunca recria nem remove PDV sozinha.

### 3.4 Painel legado → stack nova (transposição)

**Meta:** reimplementar o que o painel Cake faz para operação e players, sem manter dependência de scraping (`RADIO_PAINEL_*`).

**Manter (compatibilidade):**

- URLs e paths que os **4.000 players antigos** já consomem (identificar inventário exato do webservice legado — ver §5).
- Formato de payload que o player espera (playlist, versão, flags `controlar_player` / `controlar_playlist`, status).
- Identificadores estáveis: `painel_pdv_id` como chave de transição; destino final `rio_pdv_key` ou UUID interno com tabela de alias.

**Substituir:**

- Admin CakePHP → telas Next.js já iniciadas (`/cadastros`, drawer PDV, futuras telas de playlist/programação).
- Banco MySQL legado → Postgres (`producao_*`, novas tabelas de playlist/stream).
- Login/scrape → APIs REST autenticadas no portal.

**Descontinuar (após cutover):**

- Tela **Vínculos Rio × painel** (`/cadastros/vinculos`) — só enquanto migração não estiver 100%.
- `PainelPdvLink` como dependência runtime — vira histórico ou alias readonly.

---

## 4. Modelo de dados — evolução proposta

### 4.1 Hoje (suficiente para Fase 1)

- `CadastroProducaoLayout` — por `year_month` (competência)
- `ProducaoPdvCadastro` — por `rio_pdv_key` (estável entre meses)
- `PainelPdvLink` — ponte migração

### 4.2 Fase 2 — adições sugeridas

```
producao_pdv_cadastro          (existente — fonte de verdade cadastral)
producao_pdv_alias             (novo — painel_pdv_id, mac, serial → rio_pdv_key)
producao_playlist              (novo — programação musical, versão, vigência)
producao_player_session        (novo — último ping, versão firmware/app, IP)
producao_pdv_sinal_ca          (novo — cache inadimplência, refreshed_at)
cadastro_producao_layout       (existente — editorial por competência)
producao_event_log             (novo — auditoria: movimento, layout, player)
```

**Chave canônica do PDV na produção:** `rio_pdv_key` = `rio_comp_pdv.id` ou `linha:{linhaId}` para proxy cliente=PDV.

**Alias legado:** `producao_pdv_alias.painel_pdv_id` permite que players antigos continuem autenticando com o ID que já conhecem.

### 4.3 Separação de responsabilidades

| Camada | Dono | Mutável por |
|--------|------|-------------|
| Existência do ponto | `rio_comp_*` | Sync CA, import, virada |
| Agrupamento editorial | `cadastro_producao_layout` | Usuário em modo edição |
| Cadastro operacional | `producao_pdv_cadastro` | Drawer PDV, import inicial, API |
| O que o player consome | `producao_playlist` + cadastro | Operador produção; propagado via webservice |
| Financeiro | Cache CA | Job periódico; read-only na UI |

---

## 5. Webservice players — estratégia dos ~4.000 conectados

### 5.1 Descoberta (primeiro passo da Fase 2)

Antes de codificar, **inventariar o legado**:

1. Endpoints HTTP que os players chamam hoje (path, método, query, headers).
2. Formato de resposta (XML, JSON, texto, stream URL).
3. Frequência de polling / keep-alive.
4. Como identificam o PDV (id numérico, token, MAC, CNPJ).
5. Comportamento em `Inativo` / cliente encerrado.
6. Versões de player no campo (colunas CSV `pdvversaoplayer`, etc.).

Guardar em `docs/legado-webservice-players.md` (a produzir na Fase 2.0).

### 5.2 Arquitetura alvo: **Compatibility Gateway**

```
                    ┌─────────────────────────────┐
  Player antigo ──► │  Gateway compat (paths      │
  (4k devices)      │  legados preservados)       │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Core Produção API          │
                    │  (Next.js / Node / edge)    │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
      producao_pdv_*      cadastro_producao_*     rio_comp_* (read)
```

**Gateway:**

- Mesmo host ou subdomínio que players já usam (ex.: `painel.radioibiza.com.br` → proxy gradual para novo backend).
- Roteamento por path: legado → handler compat; novo → API v2.
- Feature flag por PDV: `player_generation: legacy | modern`.

**Player novo (futuro):**

- API v2 autenticada (token por PDV), WebSocket opcional, mesmo banco.
- Migração PDV a PDV ou por lote; gateway encaminha conforme `player_generation`.

### 5.3 Regras de cutover

1. **Leitura primeiro** — gateway responde com dados vindos de `producao_pdv_cadastro` + playlist; painel Cake em shadow read para diff.
2. **Escrita dual** (período curto) — alterações no portal novo espelham no legado só se cutover não estiver completo (opcional, custo alto).
3. **Escrita só no novo** — quando diff = 0 para amostra representativa de PDVs.
4. **Desligar Cake** — manter gateway compat por tempo indefinido para players que não atualizam app.

### 5.4 Entrada/saída e player

- `saida` na Rio → webservice retorna estado «encerrado» (definir contrato igual ao legado); após N dias, HTTP 403 ou stream silencioso.
- `entrada` → player pode registrar-se; produção só libera playlist quando cadastro mínimo OK (endereço, status Ativo, ack editorial se aplicável).
- Inadimplência CA → política configurável (só badge UI vs. degradar stream) — **decisão de negócio**, não automática no código sem flag explícita.

---

## 6. Fases de entrega sugeridas

### Fase 2.0 — Fundação (inquebrável)

- [ ] Testes automatizados layout + remapeamento ID
- [ ] `producao_event_log` e trilha de auditoria
- [ ] Job «refresh sinais CA» por competência
- [ ] Documentar webservice legado (§5.1)
- [ ] Congelar comportamentos automáticos indesejados (checklist §2)

### Fase 2.1 — Movimento Rio ↔ Produção

- [ ] Ativar banners Novos/Encerrados (`PRODUCAO_MOVIMENTO_TOP_ENABLED`)
- [ ] Regras `saida` → `status_player Inativo` (com confirmação operador se necessário)
- [ ] Virada de mês: propagar movimento sem resetar `pdv_placements`
- [ ] UI inadimplência (badge) a partir de dados CA já no portal

### Fase 2.2 — Cadastro produção completo

- [ ] CRUD playlist/programação no portal (substituir edição Cake)
- [ ] Import em massa final do painel → Postgres (one-shot), depois só leitura legado
- [ ] Remover dependência de auto-vínculo painel em cliente novo

### Fase 2.3 — Gateway webservice

- [ ] `producao_pdv_alias` populado para todos os PDVs com player
- [ ] Gateway compat com paths legados em staging
- [ ] Piloto 50–100 players reais
- [ ] Monitoramento: ping, versão, erros 4xx/5xx

### Fase 2.4 — Cutover produção

- [ ] DNS/proxy produção para gateway
- [ ] Desativar escrita no Cake
- [ ] Comunicação campo para troca gradual player novo
- [ ] Arquivar `/cadastros/vinculos` (read-only histórico → remover)

---

## 7. APIs internas (esboço)

| Endpoint | Fase | Notas |
|----------|------|-------|
| `GET/PUT /api/cadastros/month/{ym}/producao-layout` | 1 ✓ | Layout editorial |
| `GET/PUT /api/cadastros/pdv/{rioPdvKey}` | 1 ✓ | Cadastro drawer |
| `POST /api/cadastros/month/{ym}/producao-layout/reconcile` | 2.0 | Remapear IDs sem UI |
| `GET /api/producao/player/{alias}/config` | 2.3 | Payload compat legado |
| `GET /api/producao/player/{alias}/stream` | 2.3 | URL playlist / redirect |
| `POST /api/producao/player/{alias}/ping` | 2.3 | Telemetria |
| `GET /api/producao/pdv/{key}/sinais-ca` | 2.1 | Inadimplência, contratos |

Paths públicos do gateway devem **replicar** os do Cake onde o player não puder mudar.

---

## 8. O que não fazer

- Não rodar `group-hering` nem reorganizar layout no `loadAll` / sync / cron.
- Não usar scraping Cake como fonte runtime após Fase 2.2.
- Não bloquear player automaticamente por inadimplência sem política explícita aprovada.
- Não trocar `rio_pdv_key` de um PDV sem entrada em `producao_pdv_alias`.
- Não assumir que `numero_pdv_site` (cobrança) = contagem de PDVs na produção.

---

## 9. Critérios de sucesso

1. Organização HERINGTODAS / Maria Filo **permanece** após sync, virada e reload.
2. Cliente com `saida` na Rio reflete em Produção e no webservice em ≤ 1 ciclo de sync.
3. Gateway responde players piloto com **mesmo comportamento** observado no legado.
4. Operador consegue editar cadastro + playlist **sem abrir** painel Cake.
5. Zero perda de `pdv_placements` em migração `linha:{id}` → PDV real (remap automático persistido).

---

## 10. Referências no repositório

| Arquivo | Conteúdo |
|---------|----------|
| `lib/cadastros/producaoMovimento.ts` | Movimento, reconcile, flag topo UI |
| `lib/cadastros/producaoHierarchy.ts` | Merge layout, grupos custom, proxy linha |
| `lib/cadastros/producaoLayoutService.ts` | Persistência layout |
| `lib/cadastros/painelPdvLinkService.ts` | Vínculo migração (temporário) |
| `lib/radioPainel/pdvPayload.ts` | Shape cadastro painel (referência transposição) |
| `prisma/schema.prisma` | `CadastroProducaoLayout`, `ProducaoPdvCadastro`, `PainelPdvLink` |
| `components/cadastros/CadastrosGruposPanel.tsx` | UI Rio × Produção |

---

## 11. Notas da conversa (2026-05-28)

- Usuário encerrará edições manuais da coluna Produção; depois disso o sistema deve ser **inquebrável** mas **reativo** à Rio (entrada/saída).
- Produção = coração de produção/criação; painel legado será **transposto**, não descartado de imediato.
- ~4.000 players no webservice antigo — exigência de **compatibilidade** e migração gradual para players novos.
- Vínculo automático painel ao criar cliente foi útil na importação inicial; **não** é o modelo de longo prazo.
- Tela de vínculos existe só para migração; remover quando Postgres + gateway cobrirem 100% dos PDVs ativos.

---

*Este documento deve ser atualizado ao inventariar o webservice legado (Fase 2.0) e ao validar cada marco com operação.*
