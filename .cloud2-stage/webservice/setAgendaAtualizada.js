import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from '../loginByToken.js';

/** GET /api/set_agenda_atualizada/?token= — marca agenda sincronizada no PDV. */
export async function registerSetAgendaAtualizadaRoutes(app, prefix) {
  app.get(`${prefix}/set_agenda_atualizada/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const session = await loadSessionByToken(token);
    if (!session || session.pdv_status === 'I') {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    await pool
      .query(`UPDATE pdvs SET atualizacao_pendente_agenda = 'N' WHERE id = $1`, [session.pdv_id])
      .catch(() => null);

    return reply.send({ mensagem: 'ok' });
  });
}
