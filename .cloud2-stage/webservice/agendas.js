import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from './loginByToken.js';
import { intervalToLegacyHms } from './helpers.js';

/** GET /api/agendas/ — formato CakePHP (array de { Playlist: { Agendas: [...] } }). */
export async function registerAgendasRoutes(app, prefix) {
  app.get(`${prefix}/agendas/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) return reply.send({ mensagem: 'token_invalido' });

    const session = await loadSessionByToken(token);
    if (!session || session.pdv_status === 'I') {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();

    if (String(req.query?.agenda_atualizada ?? '') === '1') {
      await pool
        .query(`UPDATE pdvs SET atualizacao_pendente_agenda = 'N' WHERE id = $1`, [session.pdv_id])
        .catch(() => null);
    }

    const prog = await pool.query(
      `SELECT id FROM programas WHERE cliente_id = $1 ORDER BY id LIMIT 1`,
      [session.cliente_id],
    );
    if (prog.rowCount === 0) return reply.send([]);

    const programaId = prog.rows[0].id;
    const pls = await pool.query(
      `SELECT id, nome, tipo, programa_id, COALESCE(tocar_sempre, 'S') AS tocar_sempre,
              COALESCE(publicado, 'S') AS publicado, COALESCE(tipo_agendamento, '') AS tipo_agendamento
         FROM playlists
        WHERE programa_id = $1 AND (pdv_id IS NULL OR pdv_id = $2)
        ORDER BY id`,
      [programaId, session.pdv_id],
    );

    const resultado = [];
    for (const pl of pls.rows) {
      const agRows = await pool.query(
        `SELECT id, programa_id, playlist_id, data_agendada, dia_semana,
                hora_inicio::text AS hora_inicio, hora_fim::text AS hora_fim,
                tocar_cada, tipo_tocar, data_fim
           FROM agendas WHERE playlist_id = $1 ORDER BY dia_semana NULLS LAST, id`,
        [pl.id],
      ).catch(() => ({ rows: [] }));

      const agendas = agRows.rows.map((r) => ({
        agenda: {
          ...r,
          hora_inicio: intervalToLegacyHms(r.hora_inicio),
          hora_fim: intervalToLegacyHms(r.hora_fim),
        },
      }));

      if (agendas.length > 0 || pl.tocar_sempre === 'S') {
        resultado.push({
          Playlist: {
            id: pl.id,
            nome: pl.nome,
            tipo: pl.tipo,
            programa_id: pl.programa_id,
            publicado: pl.publicado,
            todos: 'N',
            tipo_agendamento: pl.tipo_agendamento,
            tocar_sempre: pl.tocar_sempre,
            Agendas: agendas,
          },
        });
      }
    }

    return reply.send(resultado);
  });
}
