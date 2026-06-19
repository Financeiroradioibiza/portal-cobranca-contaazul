import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from './loginByToken.js';

/** GET /api/ping/ — heartbeat Player 5; devolve flags e atualizacao_pendente. */
export async function registerPingRoutes(app, prefix) {
  app.get(`${prefix}/ping/`, async (req, reply) => {
    const token = String(req.query.token ?? '').trim();
    if (!token) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const row = await loadSessionByToken(token);
    if (!row || row.pdv_status === 'I') {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    try {
      await pool.query(
        `INSERT INTO ping_log (pdv_id, ma, ip, versao_player) VALUES ($1, $2, $3, $4)`,
        [row.pdv_id, req.query.ma ?? null, req.query.ip ?? null, req.query.versao_player ?? null],
      );
    } catch {
      /* ping_log opcional */
    }

    if (req.query.pdv_atualizado === '1') {
      await pool
        .query(`UPDATE pdvs SET atualizacao_pendente = 'N' WHERE id = $1`, [row.pdv_id])
        .catch(() => null);
      row.atualizacao_pendente = 'N';
    }

    return reply.send({
      pdv: {
        id: row.pdv_id,
        nome: row.pdv_nome,
        status: row.pdv_status,
        atualizacao_pendente: row.atualizacao_pendente ?? 'N',
        atualizacao_pendente_agenda: row.atualizacao_pendente_agenda ?? 'N',
        ctrl_player: row.ctrl_player ?? 'N',
        ctrl_placa_carro: row.ctrl_placa_carro ?? 'N',
        ctrl_playlists: row.ctrl_playlists ?? 'N',
        ...(String(row.nome_completo_contato_extra ?? '').trim() ?
          { nome_completo_contato_extra: String(row.nome_completo_contato_extra).trim() }
        : {}),
      },
      cliente: {
        id: row.cliente_id,
        nome: row.cliente_nome,
        status: row.cliente_status ?? 'A',
      },
      mensagem: 'ping_salvo',
    });
  });
}
