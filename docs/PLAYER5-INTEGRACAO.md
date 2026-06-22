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

Agendas e vinhetas: `GET /api/agendas/`, `/vinhetas_programadas/`, `/vinhetas_agendadas/`.

Avisos operador (vermelho): Player 5 chama `POST /api/player-avisos` (configurar `VITE_PLAYER_AVISOS_URL` no build do player apontando para o cloud2, ex.: `https://cloud.radioibiza.com.br/services/webservice/../player-avisos` conforme deploy).

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
| Avisos operador (Suporte) | Neon `player_aviso_operador` (lido via cloud2) | POST `/api/player-avisos` |
| Download reportado | tabela `atualizadas` | GET/POST `/save_atualizadas/` |
| Ping + versão + cache no Suporte | `ping_log` + `atualizadas` → `POST /criacao/player/telemetry` | `/api/ping/` + `/save_atualizadas/` |
| Código contato extra (ALERTACORTE/CADASTRO) | `pdvs.nome_completo_contato_extra` | loginByToken, ping |
| Logotipo cliente (JPEG) | `clientes.logotipo_jpeg` | GET `/logotipo_cliente/` + URL em loginByToken |

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

## Avisos operador (Suporte → Player)

- **Portal:** Suporte → Avisos player — grava em Neon (`player_aviso_operador`), autenticado pela sessão do portal (sem login Netlify separado).
- **Player lê:** `POST /api/player-avisos` no cloud2 (valida token via `loadSessionByToken`, consulta Neon).
- **IDs:** usar `portalClienteId` / `portalPdvId` (100, 100.001…), não IDs do painel legado.
- **Deploy player:** definir `VITE_PLAYER_AVISOS_URL` para o endpoint do cloud2 (substitui Netlify `player4`).

Código: `lib/suporte/playerAvisoService.ts`, `.cloud2-stage/webservice/playerAvisos.js`

---

## Código contato extra (ALERTACORTE / CADASTRO)

Campo opcional no cadastro PDV: `producao_pdv_cadastro.player_contato_extra_codigo` — valores `ALERTACORTE` ou `CADASTRO` (vazio = nenhum).

- Sincroniza para `pdvs.nome_completo_contato_extra` no gateway.
- Player 5 exibe aviso vermelho **somente quando** `ctrl_player=S` e `ctrl_playlists=S` (não conflita com avisos automáticos das flags `N`).

Mapeamento: `lib/player/pdvGatewayFields.ts` → sync em `playerGatewaySync.ts`

---

## Logotipo do cliente

- Gateway: `clientes.logotipo_jpeg` (BYTEA) — opcional no sync (`logotipoBase64` por cliente).
- `loginByToken` devolve URL `…/api/logotipo_cliente/?token=…` quando há JPEG.
- Endpoint: `GET /api/logotipo_cliente/?token=` → `image/jpeg` ou 404.

Upload de logo no portal: **Cadastros → IDs Player** (JPEG + sync). Coluna `player_cliente_logotipo` no Neon.

---

## Programação por PDV

- Central de programações: coluna **PDVs** amarra cada loja a uma programação do cliente (`producao_pdv_cadastro.programacao_id`).
- Sync envia `programacaoPortalId` → gateway resolve `pdvs.programa_id` via `programas.origem_programacao_id`.
- **Disparar atualização** publica a programação e sinaliza `atualizacao_pendente` **só nos PDVs amarrados**.
- Ao mudar amarração no portal, sync + signal no PDV → Player 5 refaz `/playlist/` no ping (programa por loja, não mais um programa único por cliente).
- `/playlist/` usa exclusivamente `pdvs.programa_id` (sem fallback ao primeiro programa do cliente).

---

## Criação musical → Player

1. Upload/processamento MP3 → Neon + disco cloud2
2. Montar programação (pastas)
3. **Publicar no Player 5** ou **Disparar atualização** → `publicar.ts` + `atualizacao_pendente`
4. Player baixa playlist no próximo ciclo (ping ou reload)

Cronogramas de pastas/vinhetas: publicados via `publishCronogramas.ts`. Avisos operador: Neon + `/api/player-avisos` no cloud2.

---

## Checklist de integração (prioridade)

### P0 — Tocar música (piloto)

- [x] IDs Player atribuídos + sync gateway (código)
- [x] Logins gerados + sync (`usuarios` populado)
- [x] Chave serial por PDV + sync
- [x] Programação publicada com MP3 no cloud2 (publicar.ts)
- [ ] Smoke real: login → getPdvs → loginByToken → playlist → get_musica → play (**deploy cloud2 + migrate Neon**)

### P1 — Paridade operacional (feito / em curso)

- [x] Bridge login → `usuarios` no sync-registry
- [x] Flags ctrl_* do cadastro PDV no sync
- [x] `atualizacao_pendente` após publicar / signal-atualizacao
- [x] Auto-sync ao salvar cadastro PDV
- [ ] Deploy `.cloud2-stage` no cloud2 + migrations Neon + build Player 5 (`VITE_*`)

### P2 — Programação completa

- [x] Cronogramas (`Agendamento` pasta) → `/agendas/` na publicação
- [x] Vinhetas VP/VA → playlists + `/vinhetas_programadas/` + `/vinhetas_agendadas/`
- [x] `set_agenda_atualizada/` (+ parcial via `agenda_atualizada=1` em `/agendas/`)
- [x] Avisos player (Neon + `/api/player-avisos` no cloud2; Suporte usa sessão do portal)

### P3 — Auxiliares

- [x] `save_atualizadas/` (tabela `atualizadas` no gateway)
- [x] Telemetria Suporte/Dashboard (`/criacao/player/telemetry` ← ping + cache)
- [x] `logotipo_cliente/` (endpoint + URL no loginByToken quando há JPEG)
- [x] `nome_completo_contato_extra` (campo cadastro `player_contato_extra_codigo`)
- [x] Programa por PDV (`programacaoMusical` no cadastro → `pdvs.programa_id` no gateway)

---

## Onde mexer ao adicionar feature nova

Antes de fechar qualquer feature de **Criação**, **Produção** ou **Cadastro**, perguntar:

1. **Qual endpoint do Player 5 consome isso?**
2. **Qual tabela do gateway precisa receber?**
3. **O sync/publicar já propaga ou falta wire?**

Se a resposta for «nenhum» → a feature ainda não está integrada ao player.

---

*Atualizar este doc a cada marco de integração.*
