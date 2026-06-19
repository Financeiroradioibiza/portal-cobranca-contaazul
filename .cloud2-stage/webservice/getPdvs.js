import { getPool } from '../../db/pool.js';
import { formatLegacyDateTime } from './helpers.js';

/** GET /api/getPdvs/ — lista PDVs do cliente com token (formato CakePHP). */
export async function registerGetPdvsRoutes(app, prefix) {
  app.get(`${prefix}/getPdvs/`, async (req, reply) => {
    const clienteId = Number(req.query.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return reply.send({ mensagem: 'cliente_invalido' });
    }

    const uf = req.query.uf?.trim();
    const cidade = req.query.cidade?.trim();
    const nomeFiltro = req.query.nome?.trim().toLowerCase();

    const pool = getPool();
    const params = [clienteId];
    let sql = `
      SELECT
        p.id AS pdv_id, p.nome AS pdv_nome,
        COALESCE(p.cidade, '') AS cidade, COALESCE(p.uf, '') AS uf,
        COALESCE(p.status, 'A') AS pdv_status,
        COALESCE(p.instalado, 'N') AS instalado,
        COALESCE(p.atualizacao_pendente, 'N') AS atualizacao_pendente,
        c.id AS cliente_id, c.nome AS cliente_nome, COALESCE(c.status, 'A') AS cliente_status,
        t.token, t.data_inicio, t.data_fim, t.status AS token_status
      FROM pdvs p
      JOIN clientes c ON c.id = p.cliente_id
      JOIN tokens t ON t.pdv_id = p.id
      WHERE p.cliente_id = $1
        AND COALESCE(p.instalado, 'N') = 'N'
    `;

    if (uf) {
      params.push(uf.toUpperCase());
      sql += ` AND upper(p.uf) = $${params.length}`;
    }
    if (cidade) {
      params.push(cidade);
      sql += ` AND p.cidade ILIKE $${params.length}`;
    }
    if (nomeFiltro) {
      params.push(`%${nomeFiltro}%`);
      sql += ` AND lower(p.nome) LIKE $${params.length}`;
    }

    sql += ' ORDER BY p.nome';

    const { rows } = await pool.query(sql, params);
    const mensagem = rows.map((r) => ({
      Pdv: {
        id: r.pdv_id,
        nome: r.pdv_nome,
        cidade: r.cidade,
        uf: r.uf,
        status: r.pdv_status,
        instalado: r.instalado,
        atualizacao_pendente: r.atualizacao_pendente,
      },
      Cliente: {
        id: r.cliente_id,
        nome: r.cliente_nome,
        status: r.cliente_status,
      },
      Token: [
        {
          token: r.token,
          pdv_id: r.pdv_id,
          data_inicio: formatLegacyDateTime(r.data_inicio) ?? '',
          data_fim: formatLegacyDateTime(r.data_fim),
          status: r.token_status,
        },
      ],
    }));

    return reply.send({ mensagem });
  });
}
