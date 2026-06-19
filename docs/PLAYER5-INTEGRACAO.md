# Player 5 — integração portal ↔ gateway ↔ player

Hub de referência: **tudo que o portal cria deve chegar ao Player 5** pelo webservice legado (contrato testado 15+ anos, Player 4.0 → 5.0).

Contrato completo: `playeribiza2015-2026/radio-ibiza-player-5/PROTOCOLO_WEBSERVICE.md`  
Implementação gateway: `playeribiza2015-2026/portal-ibiza` + patches em `.cloud2-stage/`  
Player PWA: `playeribiza2015-2026/radio-ibiza-player-5`

---

## Arquitetura (3 camadas)

```
Portal (Neon)          cloud2 (Postgres gateway)       Player 5 PWA
─────────────          ─────────────────────────       ────────────
Rio + cadastro    ──►  clientes, pdvs, tokens    ◄──  POST /api/login/
Logins cliente    ──►  usuarios + senha_hash          GET  /api/getPdvs/
Chave serial PDV  ──►  tokens.token + serial          GET  /api/loginByToken/
Flags controle    ──►  ctrl_player, ctrl_placa…       GET  /api/ping/
Programação       ──►  programas/playlists/musicas    GET  /api/playlist/
MP3 processado    ──►  storage_key + get_musica/      GET  /api/get_musica/
Publicar / ATL    ──►  atualizacao_pendente='S'       (ping refaz playlist)
```

**Regra de ouro:** o portal **nunca** fala direto com o player. Sempre: portal → sync/publicar → cloud2 → webservice `/api/*` → player.

---

## Fluxo do Player 5 (igual legado)

1. `POST /api/login/` — email/senha → `cliente_id`
2. `GET /api/getPdvs/?id=cliente_id` — lista PDVs não instalados + **token** (chave serial)
3. `GET /api/loginByToken/?token=…` — valida token; devolve `{token, pdv, cliente}` com flags de controle
4. `GET /api/playlist/?token=…` — pastas + faixas + `url_musica`
5. `GET /api/get_musica/?token=…` — stream MP3
6. Loop: `GET /api/ping/?token=…` (60 min) — lê `atualizacao_pendente`, `ctrl_*`
7. `GET /api/save_executadas/?token=…` — relatório do que tocou

Agendas e vinhetas: `GET /api/agendas/`, `/vinhetas_programadas/`, `/vinhetas_agendadas/` — **próxima fase** (stubs vazios hoje).

---

## O que o portal sincroniza hoje

| Dado portal | Gateway | Player lê em |
|-------------|---------|--------------|
| `portalClienteId` | `clientes.id` | login → cliente_id |
| `clientePlayerLogin` | `usuarios` + `clientes.senha_hash` | POST /login/ |
| `portalPdvId` | `pdvs.id` | getPdvs, loginByToken |
| `playerInstalacaoToken` | `tokens.token` + `pdvs.serial_instalacao` | loginByToken, 1ª instalação |
| `controlarPlayer` etc. | `ctrl_player`, `ctrl_placa_carro`, `ctrl_playlists` | loginByToken, ping |
| `statusPlayer` | `pdvs.status` A/I | loginByToken |
| Programação publicada | `programas`, `playlists`, `musicas` | playlist, get_musica |
| Publicar / disparar ATL | `atualizacao_pendente='S'` + `atualizacao_pendente_agenda='S'` | ping → refetch playlist/agendas |
| Cronogramas (pastas) | tabela `agendas` | GET `/agendas/` |
| Vinhetas VP/VA | playlists tipo VP/VA + `agendas` | `/vinhetas_programadas/`, `/vinhetas_agendadas/` |

**Gatilhos de sync no portal:**

- `POST /api/player/sync-gateway`
- Atribuir IDs faltantes
- Gerar logins faltantes (se `created > 0`)
- Salvar cadastro PDV / refazer serial
- `publicarProgramacao` / disparar atualização

Código: `lib/player/playerGatewaySync.ts`, `.cloud2-stage/player-registry.ts`

---

## Chave serial (token de instalação)

No painel legado: token na tabela `tokens`, editável com «refazer serial» no cadastro do PDV.

No portal:

- Campo: `producao_pdv_cadastro.player_instalacao_token`
- UI: Cadastro PDV → «Chave serial» + «Refazer serial»
- Sync: grava em `tokens` do gateway; troca de chave → `instalado='N'` (player reinstala)

**O player amarra o token na 1ª instalação** (`updatePdvInstalado`). Credenciais de login (email/senha) são **outra coisa** — identificam o **cliente**; o token identifica o **PDV**.

---

## Flags de controle (cadastro → player)

| Portal (cadastro PDV) | Gateway | Efeito no Player 5 |
|----------------------|---------|-------------------|
| Controlar player | `ctrl_player='S'` | Play/pause/next liberados |
| Placa de carro | `ctrl_placa_carro='S'` | UI veículos |
| Controlar playlist | `ctrl_playlists='S'` | Escolha manual de playlist |
| Status inativo | `status='I'` | Bloqueio |

Mapeamento: `lib/player/pdvGatewayFields.ts`

---

## Criação musical → Player

1. Upload/processamento MP3 → Neon + disco cloud2
2. Montar programação (pastas)
3. **Publicar no Player 5** ou **Disparar atualização** → `publicar.ts` + `atualizacao_pendente`
4. Player baixa playlist no próximo ciclo (ping ou reload)

Cronogramas de pastas/vinhetas e avisos do player: **não conectados ainda** — ver checklist abaixo.

---

## Checklist de integração (prioridade)

### P0 — Tocar música (piloto)

- [ ] IDs Player atribuídos + sync gateway
- [ ] Logins gerados + sync (`usuarios` populado)
- [ ] Chave serial por PDV + sync
- [ ] Programação publicada com MP3 no cloud2
- [ ] Smoke: login → getPdvs → loginByToken → playlist → get_musica → play

### P1 — Paridade operacional (feito / em curso)

- [x] Bridge login → `usuarios` no sync-registry
- [x] Flags ctrl_* do cadastro PDV no sync
- [x] `atualizacao_pendente` após publicar / signal-atualizacao
- [x] Auto-sync ao salvar cadastro PDV
- [ ] Deploy `.cloud2-stage` no cloud2 + migrations Neon

### P2 — Programação completa

- [x] Cronogramas (`Agendamento` pasta) → `/agendas/` na publicação
- [x] Vinhetas VP/VA → playlists + `/vinhetas_programadas/` + `/vinhetas_agendadas/`
- [ ] `set_agenda_atualizada/` (endpoint dedicado — parcial via `agenda_atualizada=1` em `/agendas/`)
- [ ] Avisos player (substituir admin Netlify player4)

### P3 — Auxiliares

- [ ] `save_atualizadas/` (barra de download)
- [ ] `logotipo_cliente/`
- [ ] Programa por PDV (se cliente precisar)

---

## Onde mexer ao adicionar feature nova

Antes de fechar qualquer feature de **Criação**, **Produção** ou **Cadastro**, perguntar:

1. **Qual endpoint do Player 5 consome isso?**
2. **Qual tabela do gateway precisa receber?**
3. **O sync/publicar já propaga ou falta wire?**

Se a resposta for «nenhum» → a feature ainda não está integrada ao player.

---

*Atualizar este doc a cada marco de integração.*
