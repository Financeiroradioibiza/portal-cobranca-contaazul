# Sessão Player 5 — 19 e 20/ago/2026

Registro consolidado: incidente Electron **`rib-decode`**, UX instalação, abas PWA e overlay «Voltar a tocar».

| Repo | Alterado em produção? |
|------|------------------------|
| `radio-ibiza-player-5` | Sim — função Netlify (19/ago) + PWA UX (20/ago) |
| `portal-cobranca-contaazul` | **Não** (só este doc) |
| cloud2 / cloud3 | **Não** |

---

## Parte A — 19/ago/2026 (~20:04) — Electron Lacca Ipanema + `rib-decode`

### Sintoma

- **Electron (.exe):** CACHE 100% no portal, player **não tocava** ambiente.
- **PWA Chrome:** mesma programação **funcionava**.

### Causa

MP3s em `C:\ProgramData\RadioIbizaPlayer\audio\` com **3519 bytes** = **HTML** do player5, não áudio.

Função `/.netlify/functions/rib-decode` **não publicada** (formato v2); HTTP 200 com `index.html`.

### Correção

- `netlify/functions/rib-decode.mjs` reescrito para Netlify Functions **v1**.
- Deploy **só função** (static PWA intacto).

| Campo | Valor |
|-------|--------|
| Deploy ID | **6a8636718e06292280105364** |
| Site | `player5.radioibiza.app.br` |

### Validação (Rafael)

- Apagou `ProgramData\RadioIbizaPlayer\audio` + `musicas-index.json`.
- Electron **passou a tocar**; download lento (esperado).
- **Considerado resolvido** — nada urgente pendente.

### rib-decode — commit git

- Função **já em produção** no Netlify.
- Código cliente (`rib.ts`, `cacheManager.ts`) + docs: **WIP local no Mac**, **não commitado** em `main`.
- **Não bloqueia operação** — .exe testado ontem já tinha o código certo embebido.
- Commit só necessário **antes do próximo build de instalador .exe** a partir do git limpo.

Rollback função: Netlify → publish deploy anterior (~`6a7dc77a…`). Ver `radio-ibiza-player-5/docs/RIB-DECODE-DEPLOY-ROLLBACK.md`.

---

## Parte B — 20/ago/2026 — UX Player (PWA + Electron remoto)

Todas as mudanças com **fallback** (`src/utils/playerUxFlags.ts`):

```js
// Rollback em campo (sem redeploy):
localStorage.setItem('radio_ibiza_primeira_carga_barra_legado', '1');
localStorage.setItem('radio_ibiza_tab_lease_legado', '1');
location.reload();
```

Build: `VITE_PRIMEIRA_CARGA_BARRA_FINAL=0` / `VITE_PLAYER_TAB_AUTO_TAKEOVER=0`

### B1 — Barra final na instalação

Após **Confirmar e abrir o player**:

- Barra grande com **%** e `X / Y faixas` durante `save_atualizadas`.
- **Fallback:** timeout **30 s** → abre player (sync continua em background).

| Commit | Shell | Deploy ID |
|--------|-------|-----------|
| `8a0c946` | 5.0.0111 | `6a86c181e0a8926c2aa72ed3` |

Ficheiros: `PrimeiraCargaBemVindo.tsx`, `downloadReport.ts`, `usePrimeiraCargaMigracaoFlow.ts`, `PrimeiraCargaPage.tsx` (desktop/mobile), `playerUxFlags.ts`.

**Canais:** PWA, TWA, Electron (carrega UI remota de player5) — mesmo código.

---

### B2 — PWA multi-aba

| Antes | Depois |
|-------|--------|
| Modal «Player já aberto» + confirmar | Nova aba abre **directo** |
| Aba antiga: modal feio | Player **pouco ofuscado** + painel «Voltar a tocar» |

**Electron (.exe):** modal Windows **mantido** (não usa auto-takeover PWA).

Iterações do overlay (mesmo dia):

| Commit | Shell | Deploy ID | Mudança |
|--------|-------|-----------|---------|
| `063ff90` | 5.0.0112 | `6a86c3459c63370359d4e511` | Logo Radio Ibiza + blur suave no player |
| `dc04d32` | **5.0.0113** | **`6a86c6f85194bd163d1fe96b`** | Painel mensagem `bg-black/20` + texto claro — **aprovado Rafael** |

Mensagem final:

> **RADIO IBIZA** (logo)  
> O player da Radio Ibiza está a tocar em outro lugar, voltar a tocar aqui?  
> Botão: **Voltar a tocar**

Ficheiro principal: `PlayerTabLeaseGuard.tsx` (`RadioIbizaEvictedPanel`).

---

## Parte C — 20/ago/2026 (manhã) — Electron UI remota + **rollback eletron20ago**

### Tentativa

- `.exe` TI abria `https://player5.radioibiza.app.br` por defeito (commit `fca5d06`, shell 5.0.0114).
- Fallback v1: `C:\ProgramData\RadioIbizaPlayer\eletron20ago.flag`.

### Incidente

- **Quebrou instalação multisusuário** — não instalava em todos os perfis Windows.
- Causa: UI remota isolava storage por perfil; ProgramData/sessão partilhada desalinhava.

### Rollback (Rafael validou .exe anterior)

| Ação | Referência |
|------|------------|
| Revert git | `003b4fb` (revert `fca5d06`) |
| PWA rollback | Deploy `6a86db3604d8aadb6a9ba4d3` — shell **5.0.0115** |
| `.exe` rollback | Deploy `6a86db7324992a5c239a418c` → `/install/RadioIbiza-Setup.exe` |
| Emergência campo (5.0.0114) | `eletron20ago.flag` + reiniciar .exe |

Instalação tipo **6** do portal continua na mesma URL do `.exe` — passa a servir o instalador rollback.

---

## Parte D — 20/ago/2026 (tarde) — Volume avisos TTS

- Selector **Volume do Aviso** 100–150% no painel Avisos (veículo + vinheta por texto).
- Commit `8378ab0`, shell **5.0.0116**, deploy `6a8705a269cf761a9c9300ee`.
- **Só** playback TTS / painel Avisos — sem loop, ping, cronogramas.
- **PWA:** activo. **`.exe`:** precisa novo build para empacotar 5.0.0116.

---

## Parte E — Baseline **eletron20ago.v2** (registo antes de patches Electron)

Antes de overlay lease no `.exe`, `runAfterFinish`, etc.:

| Item | Valor |
|------|--------|
| Doc player | `radio-ibiza-player-5/docs/ELETRON-FALLBACK-ELETRON20AGO-V2.md` |
| Tag git | `electron-baseline-eletron20ago-v2` |
| Flag rollback | `C:\ProgramData\RadioIbizaPlayer\eletron20ago.v2.flag` |
| Env | `ELECTRON_FALLBACK_ELETRON20AGO_V2=1` |

**Baseline congelado:** bundle local `file://`, lease modal clássica, NSIS sem auto-abrir, multisusuário OK.

**Pendente (conversa):** overlay PWA no Electron (cirúrgico), abrir player pós-instalação.

---

## O que **não** entrou em produção (20/ago)

Confirmado: deploys de hoje = **só UX** acima. **Sem** alteração em:

- `loop.ts`, ping, cronogramas, sync, publicação
- `rib.ts` / `cacheManager.ts` (WIP local)
- Portal, cloud2, cloud3, fila criação

WIP local no Mac (rib-decode cliente, aviso volume, ShoppingPanel, etc.) — **não publicado**.

---

## Estado final produção (atualizado 20/ago/2026 tarde)

| Item | Valor |
|------|--------|
| URL | https://player5.radioibiza.app.br |
| Shell PWA | **5.0.0116** (volume avisos) |
| Shell `.exe` empacotado | **5.0.0115** (até novo build) |
| `.exe` download | `/install/RadioIbiza-Setup.exe` (rollback local) |
| rib-decode função | ✅ (desde 19/ago) |
| Electron multisusuário | ✅ (rollback v1; baseline v2 registado) |

---

## Referências

- `radio-ibiza-player-5/docs/UX-BARRA-INSTALACAO-TAB-TAKEOVER.md`
- `radio-ibiza-player-5/docs/ELETRON-FALLBACK-ELETRON20AGO-V2.md`
- `radio-ibiza-player-5/docs/RIB-DECODE-DEPLOY-ROLLBACK.md`
- `radio-ibiza-player-5/docs/HISTORICO_DEPLOYS_NETLIFY.md`
- `.cursor/rules/producao-segura-player.mdc`

---

*Registrado 2026-08-20. Overlay 5.0.0113 aprovado. Rollback Electron + volume avisos + baseline v2 registrados.*
