import { getPool } from '../../db/pool.js';
import { apiPublicBaseUrl, intervalToLegacyHms } from './helpers.js';
import { loadSessionByToken } from './loginByToken.js';

/** GET /api/vinhetas_agendadas/ — vinhetas VA (data/hora específica). */
export async function registerVinhetasAgendadasRoutes(app, prefix) {
  app.get(`${prefix}/vinhetas_agendadas/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) return reply.send({ mensagem: 'token_invalido' });

    const session = await loadSessionByToken(token);
    if (!session) return reply.send({ mensagem: 'token_invalido' });

    const pool = getPool();
    const prog = await pool.query(
      `SELECT id FROM programas WHERE cliente_id = $1 ORDER BY id LIMIT 1`,
      [session.cliente_id],
    );
    if (prog.rowCount === 0) return reply.send([]);

    const pls = await pool.query(
      `SELECT id FROM playlists WHERE programa_id = $1 AND tipo = 'VA' ORDER BY id`,
      [prog.rows[0].id],
    );

    const baseUrl = apiPublicBaseUrl();
    const resposta = [];

    for (const pl of pls.rows) {
      const musRows = await pool.query(
        `SELECT pm.id AS pm_id, m.id AS musica_id, m.titulo, m.nome_arquivo,
                m.tamanho_bytes::text, m.duracao, m.corte_seg
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
          url_musica: `${baseUrl}/api/get_musica/?token=${encodeURIComponent(token)}&id_musica=${m.musica_id}&playlist_id=${pl.id}`,
        })),
      });
    }

    return reply.send(resposta);
  });
}
