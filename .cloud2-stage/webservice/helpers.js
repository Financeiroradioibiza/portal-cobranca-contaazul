/** Helpers compartilhados pelas rotas webservice (contrato CakePHP / Player 5). */

export function formatLegacyDateTime(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function intervalToLegacyHms(value) {
  if (value == null) return '00:00:00';
  const s = String(value);
  const m = /^(\d+):(\d{2}):(\d{2})/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}`;
  return '00:00:00';
}

/** URL pública do webservice — Player 5 baixa MP3 daqui. */
export function apiPublicBaseUrl() {
  return (
    process.env.API_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    process.env.CLOUD2_PUBLIC_URL?.replace(/\/$/, '') ||
    'https://cloud2.radioibiza.app.br'
  );
}

/** Programa do PDV: `pdvs.programa_id` amarrado no portal (sync por PDV). Sem fallback legado por cliente. */
export async function resolveProgramaIdForSession(pool, session) {
  const linked = Number(session.programa_id);
  if (Number.isFinite(linked) && linked > 0) return linked;
  return null;
}

/**
 * Faixa autorizada se estiver numa playlist do programa deste PDV
 * (mesma regra de `/playlist/` — impede IDOR por `id_musica` arbitrário).
 */
export async function musicaAutorizadaParaSession(pool, session, musicaId, playlistIdOpt) {
  const programaId = await resolveProgramaIdForSession(pool, session);
  const pdvId = Number(session.pdv_id);
  if (!programaId || !Number.isFinite(pdvId) || pdvId <= 0) return false;

  const musicaIdN = Number(musicaId);
  if (!Number.isFinite(musicaIdN) || musicaIdN <= 0) return false;

  const playlistIdN = Number(playlistIdOpt);
  if (Number.isFinite(playlistIdN) && playlistIdN > 0) {
    const scoped = await pool.query(
      `SELECT 1
         FROM playlist_musicas pm
         JOIN playlists pl ON pl.id = pm.playlist_id
        WHERE pm.musica_id = $1
          AND pl.id = $2
          AND (pl.pdv_id = $3 OR (pl.pdv_id IS NULL AND pl.programa_id = $4))
        LIMIT 1`,
      [musicaIdN, playlistIdN, pdvId, programaId],
    );
    return (scoped.rowCount ?? 0) > 0;
  }

  const r = await pool.query(
    `SELECT 1
       FROM playlist_musicas pm
       JOIN playlists pl ON pl.id = pm.playlist_id
      WHERE pm.musica_id = $1
        AND (pl.pdv_id = $2 OR (pl.pdv_id IS NULL AND pl.programa_id = $3))
      LIMIT 1`,
    [musicaIdN, pdvId, programaId],
  );
  return (r.rowCount ?? 0) > 0;
}
