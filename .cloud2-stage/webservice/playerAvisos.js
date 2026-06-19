import { loadSessionByToken } from '../loginByToken.js';
import { portalQuery } from '../../criacao/portalDb.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
};

function normalizarId(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function validarTokenParaPdv(token, clienteId, pdvId) {
  const t = String(token ?? '').trim();
  if (!t || t.length < 8) return false;

  const session = await loadSessionByToken(t);
  if (!session || session.pdv_status === 'I') return false;
  if (session.pdv_id !== pdvId) return false;
  if (session.cliente_id != null && session.cliente_id !== clienteId) return false;
  return true;
}

/** POST /api/player-avisos — contrato Netlify player-avisos (Player 5). */
export async function registerPlayerAvisosRoutes(app, prefix = '/api') {
  const path = `${prefix}/player-avisos`;

  app.options(path, async (_req, reply) => {
    reply.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    return reply.code(204).send();
  });

  app.get(path, async (_req, reply) => {
    reply.headers(HEADERS);
    return reply.send({ mensagens: [] });
  });

  app.post(path, async (req, reply) => {
    reply.headers(HEADERS);

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = typeof body.token === 'string' ? body.token : '';
    const c = normalizarId(body.cliente_id);
    const p = normalizarId(body.pdv_id);
    if (c == null || p == null) {
      return reply.send({ mensagens: [] });
    }

    try {
      const ok = await validarTokenParaPdv(token, c, p);
      if (!ok) return reply.send({ mensagens: [] });

      const res = await portalQuery<{ mensagem: string }>(
        `SELECT mensagem FROM player_aviso_operador
         WHERE portal_cliente_id = $1 AND portal_pdv_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [c, p],
      );

      const mensagens = [];
      for (const row of res.rows ?? []) {
        const m = typeof row.mensagem === 'string' ? row.mensagem.trim() : '';
        if (m) mensagens.push(m);
      }
      return reply.send({ mensagens });
    } catch (e) {
      console.error('[player-avisos]', e instanceof Error ? e.message : e);
      return reply.send({ mensagens: [] });
    }
  });
}
