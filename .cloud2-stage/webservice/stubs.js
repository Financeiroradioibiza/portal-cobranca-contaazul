import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from '../loginByToken.js';

/** GET /api/updatePdvInstalado/ */
export async function registerUpdatePdvInstaladoRoutes(app, prefix) {
  app.get(`${prefix}/updatePdvInstalado/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    const pdvId = Number(req.query.pdv_id);
    if (!token || !Number.isFinite(pdvId)) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const session = await loadSessionByToken(token);
    if (!session || session.pdv_id !== pdvId) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    await pool.query(`UPDATE pdvs SET instalado = 'S' WHERE id = $1`, [pdvId]).catch(() => null);

    return reply.send({ mensagem: 'ok' });
  });
}

/** save_executadas — parcialmente migrado; save_atualizadas em saveAtualizadas.js */
export async function registerStubRoutes(app, prefix) {
  app.get(`${prefix}/save_executadas/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    const session = token ? await loadSessionByToken(token) : null;
    if (session && req.query?.playlists_musica_id) {
      const pool = getPool();
      await pool
        .query(
          `INSERT INTO execucoes_pendentes (pdv_id, playlists_musica_id, data_execucao, ind_termino)
           VALUES ($1, $2, COALESCE($3::timestamptz, now()), COALESCE($4, 'S'))`,
          [
            session.pdv_id,
            Number(req.query.playlists_musica_id),
            req.query.data_execucao ?? null,
            req.query.ind_termino ?? 'S',
          ],
        )
        .catch(() => null);
    }
    return reply.send({ mensagem: 'ok' });
  });
}
