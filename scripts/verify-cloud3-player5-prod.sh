#!/usr/bin/env bash
# Read-only: confirma entrega Player 5 no container api (Envyron).
# Músicas ambiente → cloud3; vinhetas VP/VA → get_musica.
# Falha se hotfix sumiu, PLAYER5_ENTREGA_CF=0, ou vinheta cair em cloud3.
#
#   bash scripts/verify-cloud3-player5-prod.sh
#
set -euo pipefail

REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
INFRA="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"

ssh -o BatchMode=yes "$REMOTE" "docker compose -f '$INFRA/docker-compose.yml' exec -T api node --input-type=module -e \"
import { player5EntregaCfEnabled, pdvUsaEntregaCf, buildPlaylistUrlMusica } from '/app/dist/criacao/cfAudioUrl.js';
import fs from 'node:fs';

if (!fs.existsSync('/app/dist/criacao/cfAudioUrl.js')) {
  console.error('FAIL hotfix=MISSING — rode deploy-cloud2-api-dist-hotfix.sh');
  process.exit(1);
}

const cfEnv = (process.env.PLAYER5_ENTREGA_CF ?? '(unset)').trim();
if (!player5EntregaCfEnabled()) {
  console.error('FAIL PLAYER5_ENTREGA_CF=' + cfEnv + ' — playlist em get_musica');
  process.exit(1);
}

const pool = { query: async () => ({ rows: [] }) };
if (!(await pdvUsaEntregaCf(pool, 1))) {
  console.error('FAIL pdvUsaEntregaCf=false para PDV genérico');
  process.exit(1);
}

const url = buildPlaylistUrlMusica({
  baseUrl: 'https://x',
  token: 't',
  musicaId: 1,
  playlistId: 1,
  storageKey: 'b2:uso/musicas/00000000-0000-0000-0000-000000000001/mp3_128_mono.rib',
  useCf: true,
});
if (!url || url.includes('get_musica')) {
  console.error('FAIL buildPlaylistUrlMusica não gerou cloud3:', url || '(vazio)');
  process.exit(1);
}
if (!url.includes('cloud3') && !url.includes('msk.rib')) {
  console.error('FAIL URL inesperada:', url.slice(0, 120));
  process.exit(1);
}

const vinVp = buildPlaylistUrlMusica({
  baseUrl: 'https://x',
  token: 't',
  musicaId: 6277,
  playlistId: 1,
  storageKey: null,
  origemMusicaId: null,
  playlistTipo: 'VP',
  useCf: true,
});
if (!vinVp || !vinVp.includes('get_musica')) {
  console.error('FAIL vinheta VP deve usar get_musica, obteve:', vinVp || '(vazio)');
  process.exit(1);
}

const vinKey = buildPlaylistUrlMusica({
  baseUrl: 'https://x',
  token: 't',
  musicaId: 6277,
  playlistId: 1,
  storageKey: 'vinheta:abc-123.mp3',
  useCf: true,
});
if (!vinKey || !vinKey.includes('get_musica')) {
  console.error('FAIL storage_key vinheta: deve usar get_musica, obteve:', vinKey || '(vazio)');
  process.exit(1);
}

console.log('OK cloud3 músicas + get_musica vinhetas PLAYER5_ENTREGA_CF=' + cfEnv);
\"
"
