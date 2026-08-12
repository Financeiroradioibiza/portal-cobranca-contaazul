import type { FastifyInstance } from 'fastify';
import { portalQuery } from '../../criacao/portalDb.js';
import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from './loginByToken.js';

type UpdateQuery = { token?: string; pdv_id?: string };

/** GET /updatePdvInstalado/ — marca licença consumida; some do /getPdvs/ até refazer serial. */
export async function registerUpdatePdvInstaladoRoutes(
  app: FastifyInstance,
  prefix: string,
): Promise<void> {
  app.get<{ Querystring: UpdateQuery }>(`${prefix}/updatePdvInstalado/`, async (req, reply) => {
    const token = String(req.query.token ?? '').trim();
    const pdvId = Number(req.query.pdv_id);
    if (!token || !Number.isFinite(pdvId)) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const session = await loadSessionByToken(token);
    if (!session || session.pdv_id !== pdvId) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    await pool.query(`UPDATE pdvs SET instalado = 'S' WHERE id = $1`, [pdvId]);

    /** Espelha no Neon para o sync-registry não reabrir a licença (`instaladoPlayer: S`). */
    try {
      const meta = await pool.query<{
        origem_rio_pdv_id: string | null;
        pdv_nome: string | null;
        cliente_nome: string | null;
      }>(
        `SELECT p.origem_rio_pdv_id, p.nome AS pdv_nome, c.nome AS cliente_nome
         FROM pdvs p
         INNER JOIN clientes c ON c.id = p.cliente_id
         WHERE p.id = $1
         LIMIT 1`,
        [pdvId],
      );
      const row = meta.rows[0];
      const rioKey = String(row?.origem_rio_pdv_id ?? '').trim();
      if (rioKey) {
        await portalQuery(
          `UPDATE producao_pdv_cadastro
              SET player_instalado_em = NOW()
            WHERE rio_pdv_key = $1`,
          [rioKey],
        );

        const seq = pdvId % 1000;
        const clienteId = Math.floor(pdvId / 1000);
        const codigoDisplay = `${clienteId}.${String(seq).padStart(3, '0')}`;
        await portalQuery(
          `INSERT INTO pdv_instalacao_concluida_log (
             id, rio_pdv_key, portal_cliente_id, portal_pdv_id,
             cliente_nome, pdv_nome, cnpj,
             contato_loja_nome, contato_loja_telefone, contato_loja_email,
             codigo_display, instalado_em, created_at
           )
           SELECT
             gen_random_uuid()::text,
             c.rio_pdv_key,
             $2::int,
             $3::int,
             COALESCE(NULLIF(TRIM($4::text), ''), 'Cliente'),
             COALESCE(NULLIF(TRIM(c.nome), ''), NULLIF(TRIM($5::text), ''), 'PDV'),
             COALESCE(c.cnpj, ''),
             COALESCE(c.contato_loja_nome, ''),
             COALESCE(c.contato_loja_telefone, ''),
             COALESCE(c.contato_loja_email, ''),
             $6::text,
             NOW(),
             NOW()
           FROM producao_pdv_cadastro c
           WHERE c.rio_pdv_key = $1
           ON CONFLICT (rio_pdv_key, instalado_em) DO NOTHING`,
          [
            rioKey,
            session.cliente_id,
            pdvId,
            String(row?.cliente_nome ?? '').trim(),
            String(row?.pdv_nome ?? '').trim(),
            codigoDisplay,
          ],
        );
      }
    } catch {
      /* PORTAL_DATABASE_URL ausente ou cadastro órfão — cloud2.instalado=S basta para getPdvs. */
    }

    return reply.send({ mensagem: 'ok' });
  });
}

/** Stubs v0 — só rotas ainda sem handler dedicado (evita FST_ERR_DUPLICATED_ROUTE). */
export async function registerStubRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get<{ Querystring: { token?: string; playlists_musica_id?: string; data_execucao?: string; ind_termino?: string } }>(
    `${prefix}/save_executadas/`,
    async (req, reply) => {
      const token = String(req.query.token ?? '').trim();
      const session = token ? await loadSessionByToken(token) : null;
      if (session && req.query.playlists_musica_id) {
        const pool = getPool();
        await pool.query(
          `INSERT INTO execucoes_pendentes (pdv_id, playlists_musica_id, data_execucao, ind_termino)
           VALUES ($1, $2, COALESCE($3::timestamptz, now()), COALESCE($4, 'S'))`,
          [
            session.pdv_id,
            Number(req.query.playlists_musica_id),
            req.query.data_execucao ?? null,
            req.query.ind_termino ?? 'S',
          ],
        );
      }
      return reply.send({ mensagem: 'ok' });
    },
  );
}
