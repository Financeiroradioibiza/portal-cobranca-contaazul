import crypto from 'node:crypto';
import { getPool } from '../../db/pool.js';
import { portalQuery } from '../../criacao/portalDb.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
};

/** Mesmo cálculo do portal (`lib/suporte/instalacaoPlayService.ts`). */
function normalizePlayCodigo(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

function hashPlayCodigo(raw) {
  return crypto.createHash('sha256').update(normalizePlayCodigo(raw)).digest('hex');
}

/**
 * POST /api/loginPlayInstalacao/ — valida código Instalação 5 (Google Play, uso único).
 * Corpo: { codigo }
 * Resposta: { token } | { mensagem: 'codigo_invalido' | 'pdv_invalido' | 'pdv_ja_instalado' | 'erro_interno' }
 */
export async function registerLoginPlayInstalacaoRoutes(app, prefix = '/api') {
  const path = `${prefix}/loginPlayInstalacao/`;

  app.options(path, async (_req, reply) => {
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return reply.code(204).send();
  });

  app.post(path, async (req, reply) => {
    reply.headers(HEADERS);

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const codigo = normalizePlayCodigo(body.codigo);
    if (!codigo || !codigo.startsWith('PL5') || codigo.length < 11) {
      return reply.send({ mensagem: 'codigo_invalido' });
    }

    try {
      const hash = hashPlayCodigo(codigo);
      const sel = await portalQuery(
        `SELECT id, portal_cliente_id, portal_pdv_id, rio_pdv_key
         FROM pdv_instalacao_play_codigo
         WHERE codigo_hash = $1 AND ativa = true AND usada_em IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [hash],
      );
      const row = sel.rows?.[0];
      if (!row) {
        return reply.send({ mensagem: 'codigo_invalido' });
      }

      const rioKey = String(row.rio_pdv_key ?? '').trim();
      if (rioKey) {
        const cad = await portalQuery(
          `SELECT player_instalado_em FROM producao_pdv_cadastro WHERE rio_pdv_key = $1 LIMIT 1`,
          [rioKey],
        );
        const instalado = cad.rows?.[0]?.player_instalado_em;
        if (instalado) {
          return reply.send({ mensagem: 'pdv_ja_instalado' });
        }
      }

      const c = Number(row.portal_cliente_id);
      const p = Number(row.portal_pdv_id);

      const pool = getPool();
      const tok = await pool.query(
        `SELECT t.token
         FROM tokens t
         INNER JOIN pdvs p ON p.id = t.pdv_id
         WHERE p.id = $1 AND p.cliente_id = $2
         ORDER BY t.data_inicio DESC
         LIMIT 1`,
        [p, c],
      );
      const token = String(tok.rows?.[0]?.token ?? '').trim();
      if (!token) {
        return reply.send({ mensagem: 'pdv_invalido' });
      }

      await portalQuery(
        `UPDATE pdv_instalacao_play_codigo SET usada_em = now(), ativa = false WHERE id = $1`,
        [row.id],
      );

      return reply.send({ token, cliente_id: c, pdv_id: p });
    } catch (e) {
      console.error('[loginPlayInstalacao]', e instanceof Error ? e.message : e);
      return reply.send({ mensagem: 'erro_interno' });
    }
  });
}
