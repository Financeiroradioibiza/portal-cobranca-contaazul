import crypto from 'node:crypto';
import { portalQuery } from '../../criacao/portalDb.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function normId(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolveRioPdvKeyFromPortalPdvId(portalPdvId) {
  const r = await portalQuery(
    `SELECT portal_pdv_ids_by_rio_pdv_key FROM cadastro_producao_layout
      ORDER BY year_month DESC LIMIT 1`,
  );
  const map = r.rows[0]?.portal_pdv_ids_by_rio_pdv_key;
  if (!map || typeof map !== 'object') return null;
  for (const [key, id] of Object.entries(map)) {
    if (Number(id) === portalPdvId) return key;
  }
  return null;
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

async function createChamadoFeedback({ clienteNome, pdvNome, mensagem, clienteId, pdvId }) {
  const titulo = `Feedback Player — ${clienteNome || 'Cliente'}`.slice(0, 200);
  const descricao = [
    mensagem,
    '',
    '---',
    `Cliente: ${clienteNome || '—'}${clienteId != null ? ` (id ${clienteId})` : ''}`,
    `PDV: ${pdvNome || '—'}${pdvId != null ? ` (id ${pdvId})` : ''}`,
  ]
    .join('\n')
    .slice(0, 8000);
  const id = crypto.randomUUID();
  await portalQuery(
    `INSERT INTO chamado
       (id, titulo, descricao, status, prioridade, setores_json, responsaveis_json,
        criado_por_email, criado_por_nome, created_at, updated_at)
     VALUES ($1, $2, $3, 'aberto', 'media', $4, '[]', $5, $6, now(), now())`,
    [
      id,
      titulo,
      descricao,
      JSON.stringify(['relacionamento']),
      'player5@radioibiza.com.br',
      'Player 5',
    ],
  );
  return id;
}

async function insertPlayerIngest(row) {
  await portalQuery(
    `INSERT INTO player_ingest
       (id, tipo, status, cliente_gateway_id, cliente_nome, pdv_gateway_id, pdv_nome,
        portal_pdv_id, rio_pdv_key, mensagem, payload_json, chamado_id, created_at, updated_at)
     VALUES ($1, $2, 'pendente', $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())`,
    [
      row.id,
      row.tipo,
      row.clienteGatewayId,
      row.clienteNome,
      row.pdvGatewayId,
      row.pdvNome,
      row.portalPdvId,
      row.rioPdvKey,
      row.mensagem,
      row.payloadJson,
      row.chamadoId ?? null,
    ],
  );
}

/** POST /api/player-feedback/ — Player 5 → chamado Relacionamento. */
export async function registerPlayerFeedbackRoutes(app, prefix = '/api') {
  const path = `${prefix}/player-feedback/`;

  app.options(path, async (_req, reply) => {
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return reply.code(204).send();
  });

  app.post(path, async (req, reply) => {
    reply.header('Content-Type', 'application/json; charset=utf-8');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mensagem = str(body.mensagem);
    if (mensagem.length < 5) {
      return reply.code(400).send({ ok: false, error: 'mensagem_curta' });
    }

    const clienteNome = str(body.nome_cliente) || str(body.clienteNome) || '—';
    const pdvNome = str(body.nome_pdv) || str(body.pdvNome) || '—';
    const clienteGatewayId = normId(body.cliente_id ?? body.clienteGatewayId);
    const pdvGatewayId = normId(body.pdv_id ?? body.pdvGatewayId);

    try {
      const portalPdvId = await resolvePortalPdvId(pdvGatewayId);
      const rioPdvKey =
        portalPdvId != null ? await resolveRioPdvKeyFromPortalPdvId(portalPdvId) : null;
      const chamadoId = await createChamadoFeedback({
        clienteNome,
        pdvNome,
        mensagem,
        clienteId: clienteGatewayId,
        pdvId: pdvGatewayId,
      });
      const id = crypto.randomUUID();
      await insertPlayerIngest({
        id,
        tipo: 'feedback',
        clienteGatewayId,
        clienteNome: clienteNome.slice(0, 200),
        pdvGatewayId,
        pdvNome: pdvNome.slice(0, 200),
        portalPdvId,
        rioPdvKey,
        mensagem: mensagem.slice(0, 8000),
        payloadJson: JSON.stringify({ clienteGatewayId, pdvGatewayId }),
        chamadoId,
      });
      return reply.send({ ok: true, id, chamadoId, mensagem: 'feedback_salvo' });
    } catch (e) {
      console.error('[player-feedback]', e instanceof Error ? e.message : e);
      return reply.code(500).send({ ok: false, error: 'server_error' });
    }
  });
}

/** POST /api/player-cadastro/ — atualização de cadastro enviada pelo player. */
export async function registerPlayerCadastroRoutes(app, prefix = '/api') {
  const path = `${prefix}/player-cadastro/`;

  app.options(path, async (_req, reply) => {
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return reply.code(204).send();
  });

  app.post(path, async (req, reply) => {
    reply.header('Content-Type', 'application/json; charset=utf-8');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clienteNome = str(body.nome_cliente) || str(body.clienteNome) || '—';
    const pdvNome = str(body.nome_pdv) || str(body.pdvNome) || '—';
    const clienteGatewayId = normId(body.cliente_id ?? body.clienteGatewayId);
    const pdvGatewayId = normId(body.pdv_id ?? body.pdvGatewayId);

    try {
      const portalPdvId = await resolvePortalPdvId(pdvGatewayId);
      const rioPdvKey =
        portalPdvId != null ? await resolveRioPdvKeyFromPortalPdvId(portalPdvId) : null;
      const id = crypto.randomUUID();
      await insertPlayerIngest({
        id,
        tipo: 'cadastro',
        clienteGatewayId,
        clienteNome: clienteNome.slice(0, 200),
        pdvGatewayId,
        pdvNome: pdvNome.slice(0, 200),
        portalPdvId,
        rioPdvKey,
        mensagem: '',
        payloadJson: JSON.stringify(body).slice(0, 12000),
        chamadoId: null,
      });
      return reply.send({ ok: true, id, mensagem: 'cadastro_recebido' });
    } catch (e) {
      console.error('[player-cadastro]', e instanceof Error ? e.message : e);
      return reply.code(500).send({ ok: false, error: 'server_error' });
    }
  });
}
