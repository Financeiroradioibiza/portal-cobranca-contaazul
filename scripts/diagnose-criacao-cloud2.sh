#!/usr/bin/env bash
# Diagnóstico rápido do pipeline Criação no cloud2 (Fase A).
#
# Uso local:
#   bash scripts/diagnose-criacao-cloud2.sh
#
# Variáveis:
#   CLOUD2_HOST   default: radioibiza@cloudserver165.envyron.cloud
#   INFRA_DIR     default: /opt/portal-ibiza/infra

set -euo pipefail

REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
INFRA="${INFRA_DIR:-/opt/portal-ibiza/infra}"
APP="${CLOUD2_APP_DIR:-/opt/portal-ibiza/app}"
STORAGE="${CRIACAO_STORAGE_ROOT:-/var/lib/portal-ibiza/criacao}"

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15)

section() { echo ""; echo "=== $1 ==="; }

section "Host / Docker"
"${SSH[@]}" "$REMOTE" "hostname; date -Is; cd '$INFRA' && docker compose ps api worker-audio 2>/dev/null || docker compose ps"

section "ffmpeg / fpcalc"
"${SSH[@]}" "$REMOTE" "command -v ffmpeg && ffmpeg -version | head -1; command -v ffprobe && ffprobe -version | head -1; command -v fpcalc && fpcalc -version 2>/dev/null || echo 'fpcalc: ausente (dedupe só SHA256)'"

section "Storage ($STORAGE)"
"${SSH[@]}" "$REMOTE" "df -h '$STORAGE' 2>/dev/null || df -h /var/lib; ls -la '$STORAGE' 2>/dev/null | head -20; echo '--- uso/musicas (amostra) ---'; ls '$STORAGE/uso/musicas' 2>/dev/null | head -5 || echo 'sem faixas em uso/'"

section "Env worker (mix, rib, Neon)"
"${SSH[@]}" "$REMOTE" "cd '$INFRA' && docker compose exec -T worker-audio sh -c 'echo CRIACAO_DEFAULT_MIX_SEG=\${CRIACAO_DEFAULT_MIX_SEG:-(default 1)}; echo CRIACAO_STORAGE_ROOT=\${CRIACAO_STORAGE_ROOT:-}; echo CRIACAO_RIB_SECRET=\${CRIACAO_RIB_SECRET:+set}; echo PORTAL_DATABASE_URL=\${PORTAL_DATABASE_URL:+set}; echo GEMINI_API_KEY=\${GEMINI_API_KEY:+set}' 2>/dev/null || echo 'worker-audio indisponível'"

section "Fila Neon (últimos jobs)"
"${SSH[@]}" "$REMOTE" "cd '$INFRA' && docker compose exec -T worker-audio node -e \"
const { portalQuery } = require('./dist/criacao/portalDb.js');
(async () => {
  try {
    const j = await portalQuery('SELECT id, status, etapa_atual, itens_feitos, itens_total FROM processamento_job ORDER BY created_at DESC LIMIT 3');
    console.log(JSON.stringify(j.rows, null, 2));
    const i = await portalQuery(\\\"SELECT status, count(*)::int AS n FROM processamento_item GROUP BY status\\\");
    console.log('itens:', JSON.stringify(i.rows));
  } catch (e) { console.error(e.message || e); process.exit(1); }
})();
\" 2>/dev/null || echo 'query Neon falhou (worker parado ou dist desatualizado)'"

section "Logs worker (últimas 15 linhas JSON)"
"${SSH[@]}" "$REMOTE" "cd '$INFRA' && docker compose logs --tail=15 worker-audio 2>/dev/null"

section "Health API"
curl -sf -o /dev/null -w "cloud2 GET /health → HTTP %{http_code}\n" "https://cloud2.radioibiza.app.br/health" 2>/dev/null || echo "curl health falhou (rede local?)"

section "Storage dirs (du -sh)"
"${SSH[@]}" "$REMOTE" "for d in upload work download-staging uso/musicas master-local; do du -sh '$STORAGE'/\$d 2>/dev/null || true; done"

section "Órfãos (GET /criacao/ops/orphans — read-only)"
if [[ -n "${CRIACAO_INGEST_SECRET:-}" ]]; then
  curl -sf -H "x-criacao-secret: $CRIACAO_INGEST_SECRET" \
    "https://cloud2.radioibiza.app.br/criacao/ops/orphans" 2>/dev/null \
    | python3 -m json.tool 2>/dev/null \
    || echo "ops/orphans indisponível (deploy pendente ou secret inválido)"
else
  echo "Defina CRIACAO_INGEST_SECRET localmente para consultar /criacao/ops/orphans"
  echo "Ou após deploy: curl -H 'x-criacao-secret: …' https://cloud2.radioibiza.app.br/criacao/ops/orphans"
fi

echo ""
echo "Checklist:"
echo "  [ ] worker-audio Up"
echo "  [ ] ffmpeg no container/host"
echo "  [ ] PORTAL_DATABASE_URL set"
echo "  [ ] CRIACAO_STORAGE_ROOT gravável"
echo "  [ ] CRIACAO_DEFAULT_MIX_SEG=1 (ou omitido)"
echo "  [ ] Upload teste → status pronta + mp3_128_mono em uso/"
