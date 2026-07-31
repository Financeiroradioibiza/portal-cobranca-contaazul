import { getPool } from '../../db/pool.js';
import { apiPublicBaseUrl, intervalToLegacyHms, resolveProgramaIdForSession } from './helpers.js';
import { loadSessionByToken } from './loginByToken.js';
import { buildPlaylistUrlMusica, pdvUsaEntregaCf } from '../../criacao/cfAudioUrl.js';

/** GET /api/vinhetas_agendadas/ — vinhetas VA (data/hora específica). */
export async function registerVinhetasAgendadasRoutes(app, prefix) {
  app.get(`${prefix}/vinhetas_agendadas/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) return reply.send({ mensagem: 'token_invalido' });

    const session = await loadSessionByToken(token);
    if (!session) return reply.send({ mensagem: 'token_invalido' });

    const pool = getPool();
    const programaId = await resolveProgramaIdForSession(pool, session);
    if (!programaId) return reply.send([]);

    const useCf = await pdvUsaEntregaCf(pool, session.pdv_id);

    const pls = await pool.query(
      `SELECT id FROM playlists WHERE programa_id = $1 AND tipo = 'VA' ORDER BY id`,
      [programaId],
    );

    const baseUrl = apiPublicBaseUrl();
    const resposta = [];

    for (const pl of pls.rows) {
      const musRows = await pool.query(
        `SELECT pm.id AS pm_id, m.id AS musica_id, m.titulo, m.nome_arquivo,
                m.tamanho_bytes::text, m.duracao, m.corte_seg, m.storage_key, m.origem_musica_id
           FROM playlist_musicas pm
           JOIN musicas m ON m.id = pm.musica_id
          WHERE pm.playlist_id = $1 ORDER BY pm.ordem, pm.id`,
        [pl.id],
      );

      resposta.push({
        id: pl.id,
        musicas: musRows.rows.map((m) => ({
          musica: {
            id: m.musica_id,
            playlist_musica_id: String(m.pm_id),
            titulo: m.titulo,
            nome_arquivo: m.nome_arquivo,
            tamanho_arquivo: m.tamanho_bytes,
            duracao: intervalToLegacyHms(m.duracao),
            corte: String(m.corte_seg),
            downloaded: '0',
          },
          url_musica: buildPlaylistUrlMusica({
            baseUrl,
            token,
            musicaId: m.musica_id,
            playlistId: pl.id,
            storageKey: m.storage_key,
            origemMusicaId: m.origem_musica_id,
            useCf,
          }),
        })),
      });
    }

    return reply.send(resposta);
  });
}
