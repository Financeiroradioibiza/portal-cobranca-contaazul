import crypto from 'node:crypto';
import { getPool } from '../../db/pool.js';
import { portalQuery } from '../../criacao/portalDb.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
};

function normalizarId(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Mesmo cálculo do portal (`lib/suporte/instalacaoService.ts`). */
function normalizeSenha(s) {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function hashSenha(s) {
  return crypto.createHash('sha256').update(normalizeSenha(s)).digest('hex');
}

/**
 * POST /api/loginPdvSenhaTemp/ — valida a senha temporária de instalação (uso único)
 * gerada no portal (Suporte → Instalação). Em sucesso, consome a senha (Neon) e devolve
 * o token do PDV para o player seguir por `/loginByToken/`.
 *
 * Corpo: { cliente_id, pdv_id, senha }
 * Resposta: { token } | { mensagem: 'senha_invalida' | 'pdv_invalido' | 'erro_interno' }
 */
export async function registerLoginPdvSenhaTempRoutes(app, prefix = '/api') {
  const path = `${prefix}/loginPdvSenhaTemp/`;

  app.options(path, async (_req, reply) => {
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return reply.code(204).send();
  });

  app.post(path, async (req, reply) => {
    reply.headers(HEADERS);

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const c = normalizarId(body.cliente_id);
    const p = normalizarId(body.pdv_id);
    const senha = normalizeSenha(body.senha);
    if (c == null || p == null || !senha) {
      return reply.send({ mensagem: 'pdv_invalido' });
    }

    try {
      const hash = hashSenha(senha);
      const sel = await portalQuery(
        `SELECT id FROM pdv_instalacao_senha_temp
         WHERE portal_cliente_id = $1 AND portal_pdv_id = $2
           AND ativa = true AND usada_em IS NULL AND senha_hash = $3
         ORDER BY created_at DESC
         LIMIT 1`,
        [c, p, hash],
      );
      const row = sel.rows?.[0];
      if (!row) {
        return reply.send({ mensagem: 'senha_invalida' });
      }

      // Busca o token do PDV ANTES de consumir — não queima a senha se faltar token.
      const pool = getPool();
      const tok = await pool.query(
        `SELECT token FROM tokens
         WHERE pdv_id = $1 AND COALESCE(status, 'A') = 'A'
         ORDER BY data_inicio DESC LIMIT 1`,
        [p],
      );
      const token = String(tok.rows?.[0]?.token ?? '').trim();
      if (!token) {
        return reply.send({ mensagem: 'pdv_invalido' });
      }

      // Consome (uso único): próxima reinstalação exige nova senha no portal.
      await portalQuery(
        `UPDATE pdv_instalacao_senha_temp SET usada_em = now(), ativa = false WHERE id = $1`,
        [row.id],
      );

      return reply.send({ token });
    } catch (e) {
      console.error('[loginPdvSenhaTemp]', e instanceof Error ? e.message : e);
      return reply.send({ mensagem: 'erro_interno' });
    }
  });
}
