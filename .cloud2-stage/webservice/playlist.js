import { getPool } from '../../db/pool.js';
import { apiPublicBaseUrl, intervalToLegacyHms, resolveProgramaIdForSession } from './helpers.js';
import { loadSessionByToken } from './loginByToken.js';

/** GET /api/playlist/ — programação musical (pastas + faixas + url_musica). */
export async function registerPlaylistRoutes(app, prefix) {
  app.get(`${prefix}/playlist/`, async (req, reply) => {
    const token = String(req.query.token ?? '').trim();
    if (!token) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const session = await loadSessionByToken(token);
    if (!session) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    const programaId = await resolveProgramaIdForSession(pool, session);
    if (!programaId) {
      return reply.send({ mensagem: 'programa_nao_encontrado' });
    }

    const prog = await pool.query(
      `SELECT id, nome FROM programas WHERE id = $1 AND cliente_id = $2 LIMIT 1`,
      [programaId, session.cliente_id],
    );
    if (prog.rowCount === 0) {
      return reply.send({ mensagem: 'programa_nao_encontrado' });
    }

    const playlists = await pool.query(
      `SELECT id, nome, tipo, tocar_sempre, COALESCE(selecionavel, 'N') AS selecionavel, tempo_total, tocar_cada, tipo_tocar
         FROM playlists
        WHERE programa_id = $2 AND (pdv_id IS NULL OR pdv_id = $1)
        ORDER BY id`,
      [session.pdv_id, programaId],
    );

    const musicasByPlaylist = await pool.query(
      `SELECT
         pl.id AS playlist_id, pm.id AS pm_id,
         m.titulo, m.nome_arquivo, m.tamanho_bytes::text, m.duracao, m.corte_seg,
         COALESCE(pm.downloaded, 'N') AS downloaded,
         a.id AS artista_id, a.nome AS artista_nome, m.id AS musica_id
       FROM playlists pl
       JOIN playlist_musicas pm ON pm.playlist_id = pl.id
       JOIN musicas m ON m.id = pm.musica_id
       LEFT JOIN artistas a ON a.id = pm.artista_id
       WHERE pl.programa_id = $2 AND (pl.pdv_id IS NULL OR pl.pdv_id = $1)
       ORDER BY pl.id, pm.ordem, pm.id`,
      [session.pdv_id, programaId],
    );

    const musicasMap = new Map();
    for (const m of musicasByPlaylist.rows) {
      const list = musicasMap.get(m.playlist_id) ?? [];
      list.push(m);
      musicasMap.set(m.playlist_id, list);
    }

    const baseUrl = apiPublicBaseUrl();

    return reply.send({
      programa: { id: prog.rows[0].id, nome: prog.rows[0].nome, cliente_id: session.cliente_id },
      playlists: playlists.rows.map((pl) => ({
        id: pl.id,
        nome: pl.nome,
        tipo: pl.tipo,
        tocar_sempre: pl.tocar_sempre,
        selecionavel: pl.selecionavel ?? 'N',
        tempo_total: intervalToLegacyHms(pl.tempo_total),
        tocar_cada: pl.tocar_cada,
        tipo_tocar: pl.tipo_tocar,
        musicas: (musicasMap.get(pl.id) ?? []).map((m) => ({
          musica: {
            id: m.musica_id,
            playlist_musica_id: String(m.pm_id),
            titulo: m.titulo,
            nome_arquivo: m.nome_arquivo,
            tamanho_arquivo: m.tamanho_bytes,
            duracao: intervalToLegacyHms(m.duracao),
            corte: String(m.corte_seg),
            downloaded: m.downloaded,
          },
          artista: {
            id: m.artista_id ?? 0,
            nome: m.artista_nome ?? '',
            foto: '',
          },
          url_musica: `${baseUrl}/api/get_musica/?token=${encodeURIComponent(token)}&id_musica=${m.musica_id}&playlist_id=${pl.id}`,
        })),
      })),
    });
  });
}
