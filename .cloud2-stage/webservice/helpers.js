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

/**
 * Programa musical deste PDV — sempre `pdvs.programa_id`, validado contra o cliente da sessão.
 * Nunca faz fallback para “primeiro programa do cliente”.
 */
export async function resolveProgramaIdForSession(pool, session) {
  const pdvId = Number(session.pdv_id);
  const clienteId = Number(session.cliente_id);
  if (!Number.isFinite(pdvId) || pdvId <= 0 || !Number.isFinite(clienteId) || clienteId <= 0) {
    return null;
  }

  const r = await pool.query(
    `SELECT p.programa_id, pr.cliente_id AS programa_cliente_id
       FROM pdvs p
       LEFT JOIN programas pr ON pr.id = p.programa_id
      WHERE p.id = $1 AND p.cliente_id = $2
      LIMIT 1`,
    [pdvId, clienteId],
  );
  const row = r.rows[0];
  const programaId = Number(row?.programa_id);
  if (!Number.isFinite(programaId) || programaId <= 0) return null;
  if (Number(row.programa_cliente_id) !== clienteId) return null;
  return programaId;
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
          AND pl.programa_id = $3
          AND (pl.pdv_id IS NULL OR pl.pdv_id = $4)
        LIMIT 1`,
      [musicaIdN, playlistIdN, programaId, pdvId],
    );
    return (scoped.rowCount ?? 0) > 0;
  }

  const r = await pool.query(
    `SELECT 1
       FROM playlist_musicas pm
       JOIN playlists pl ON pl.id = pm.playlist_id
      WHERE pm.musica_id = $1
        AND pl.programa_id = $2
        AND (pl.pdv_id IS NULL OR pl.pdv_id = $3)
      LIMIT 1`,
    [musicaIdN, programaId, pdvId],
  );
  return (r.rowCount ?? 0) > 0;
}
