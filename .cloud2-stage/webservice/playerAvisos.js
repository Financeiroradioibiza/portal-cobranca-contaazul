import { loadSessionByToken } from '../loginByToken.js';
import { portalQuery } from '../../criacao/portalDb.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
};

const MODELOS_AUTOMATIZADOS = new Set(['cadastro_loja', 'cadastro_financeiro']);

function normalizarId(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolvePortalPdvId(pdvGatewayId) {
  if (pdvGatewayId == null) return null;
  const link = await portalQuery(
    `SELECT rc.portal_pdv_id
       FROM painel_pdv_link pl
       JOIN rio_comp_pdv rc ON rc.id = pl.rio_comp_pdv_id
      WHERE pl.painel_pdv_id = $1 LIMIT 1`,
    [pdvGatewayId],
  );
  const portalPdvId = link.rows[0]?.portal_pdv_id;
  if (portalPdvId != null) return Number(portalPdvId);
  return pdvGatewayId;
}

function portalClienteIdFromPdvId(portalPdvId) {
  return Math.floor(portalPdvId / 1000);
}

async function validarTokenParaPdv(token, clienteId, pdvId) {
  const t = String(token ?? '').trim();
  if (!t || t.length < 8) return null;

  const session = await loadSessionByToken(t);
  if (!session || session.pdv_status === 'I') return null;
  if (session.pdv_id !== pdvId) return null;
  if (session.cliente_id != null && session.cliente_id !== clienteId) return null;
  return session;
}

function parseModelo(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (MODELOS_AUTOMATIZADOS.has(s)) return s;
  return 'manual';
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
    return reply.send({ mensagens: [], avisos: [] });
  });

  app.post(path, async (req, reply) => {
    reply.headers(HEADERS);

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = typeof body.token === 'string' ? body.token : '';
    const c = normalizarId(body.cliente_id);
    const p = normalizarId(body.pdv_id);
    if (c == null || p == null) {
      return reply.send({ mensagens: [], avisos: [] });
    }

    try {
      const session = await validarTokenParaPdv(token, c, p);
      if (!session) return reply.send({ mensagens: [], avisos: [] });

      const portalPdvId = await resolvePortalPdvId(session.pdv_id);
      if (portalPdvId == null) return reply.send({ mensagens: [], avisos: [] });
      const portalClienteId = portalClienteIdFromPdvId(portalPdvId);

      const res = await portalQuery(
        `SELECT id, mensagem, COALESCE(modelo, 'manual') AS modelo
           FROM player_aviso_operador
          WHERE portal_cliente_id = $1 AND portal_pdv_id = $2
          ORDER BY created_at DESC
          LIMIT 50`,
        [portalClienteId, portalPdvId],
      );

      const mensagens = [];
      const avisos = [];
      for (const row of res.rows ?? []) {
        const m = typeof row.mensagem === 'string' ? row.mensagem.trim() : '';
        if (!m) continue;
        const modelo = parseModelo(row.modelo);
        if (MODELOS_AUTOMATIZADOS.has(modelo)) {
          avisos.push({
            id: String(row.id ?? ''),
            modelo,
            mensagem: m,
            bloqueia: true,
          });
        } else {
          mensagens.push(m);
        }
      }
      return reply.send({ mensagens, avisos });
    } catch (e) {
      console.error('[player-avisos]', e instanceof Error ? e.message : e);
      return reply.send({ mensagens: [], avisos: [] });
    }
  });
}

/** Remove aviso automatizado após cadastro enviado (ping ou ingest). */
export async function resolverAvisoAutomatizadoPortal(portalPdvId, modeloRaw) {
  const modelo = parseModelo(modeloRaw);
  if (!MODELOS_AUTOMATIZADOS.has(modelo)) return false;
  const portalClienteId = portalClienteIdFromPdvId(portalPdvId);
  if (!Number.isFinite(portalClienteId) || !Number.isFinite(portalPdvId)) return false;
  try {
    const res = await portalQuery(
      `DELETE FROM player_aviso_operador
        WHERE portal_cliente_id = $1 AND portal_pdv_id = $2 AND modelo = $3`,
      [portalClienteId, portalPdvId, modelo],
    );
    return (res.rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[player-avisos/resolver]', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function resolverAvisoAutomatizadoPorGatewayPdv(pdvGatewayId, modeloRaw) {
  const portalPdvId = await resolvePortalPdvId(pdvGatewayId);
  if (portalPdvId == null) return false;
  return resolverAvisoAutomatizadoPortal(portalPdvId, modeloRaw);
}
