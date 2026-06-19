import { getPool } from '../../db/pool.js';
import { apiPublicBaseUrl, intervalToLegacyHms } from './helpers.js';
import { loadSessionByToken } from './loginByToken.js';

/** GET /api/vinhetas_programadas/ — vinhetas VP (intervalo regular). */
export async function registerVinhetasProgramadasRoutes(app, prefix) {
  app.get(`${prefix}/vinhetas_programadas/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) return reply.send({ mensagem: 'token_invalido' });

    const session = await loadSessionByToken(token);
    if (!session) return reply.send({ mensagem: 'token_invalido' });

    const pool = getPool();
    const prog = await pool.query(
      `SELECT id FROM programas WHERE cliente_id = $1 ORDER BY id LIMIT 1`,
      [session.cliente_id],
    );
    if (prog.rowCount === 0) return reply.send({ playlists: [] });

    const pls = await pool.query(
      `SELECT id, tocar_cada, tipo_tocar FROM playlists
        WHERE programa_id = $1 AND tipo = 'VP' AND COALESCE(publicado, 'S') = 'S'
        ORDER BY id`,
      [prog.rows[0].id],
    );

    const baseUrl = apiPublicBaseUrl();
    const playlists = [];

    for (const pl of pls.rows) {
      const agRows = await pool.query(
        `SELECT id, dia_semana, hora_inicio::text AS hora_inicio, hora_fim::text AS hora_fim,
                tocar_cada, tipo_tocar, data_agendada, data_fim
           FROM agendas WHERE playlist_id = $1 ORDER BY id`,
        [pl.id],
      ).catch(() => ({ rows: [] }));

      const musRows = await pool.query(
        `SELECT pm.id AS pm_id, m.id AS musica_id, m.titulo, m.nome_arquivo,
                m.tamanho_bytes::text, m.duracao, m.corte_seg
           FROM playlist_musicas pm
           JOIN musicas m ON m.id = pm.musica_id
          WHERE pm.playlist_id = $1 ORDER BY pm.ordem, pm.id`,
        [pl.id],
      );

      playlists.push({
        id: pl.id,
        tipo_tocar: pl.tipo_tocar ?? agRows.rows[0]?.tipo_tocar ?? 'minuto',
        tocar_cada: pl.tocar_cada ?? agRows.rows[0]?.tocar_cada ?? 15,
        agenda: agRows.rows.map((a) => ({
          ...a,
          hora_inicio: intervalToLegacyHms(a.hora_inicio),
          hora_fim: intervalToLegacyHms(a.hora_fim),
        })),
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

    return reply.send({ playlists });
  });
}
