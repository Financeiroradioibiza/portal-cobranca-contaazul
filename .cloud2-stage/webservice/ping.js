import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from './loginByToken.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { avaliarBloqueioReproducao, healGatewayStatusSeNecessario } from './rioCobrancaBlock.js';
import { resolverAvisoAutomatizadoPorGatewayPdv } from './playerAvisos.js';
import { randomUUID } from 'node:crypto';

function buildPingPdvPayload(row, extras = {}) {
  const serialInstalacao = String(row.serial_instalacao ?? '').trim();
  const cachePercent = extras.cache_download_percent;
  return {
    id: row.pdv_id,
    nome: row.pdv_nome,
    status: row.pdv_status ?? 'A',
    atualizacao_pendente: row.atualizacao_pendente ?? 'N',
    atualizacao_pendente_agenda: row.atualizacao_pendente_agenda ?? 'N',
    forcar_cache_completo: row.forcar_cache_completo ?? 'N',
    ctrl_player: row.ctrl_player ?? 'N',
    ctrl_placa_carro: row.ctrl_placa_carro ?? 'N',
    ctrl_playlists: row.ctrl_playlists ?? 'N',
    ...(typeof cachePercent === 'number' && Number.isFinite(cachePercent) ?
      { cache_download_percent: Math.min(100, Math.max(0, Math.round(cachePercent))) }
    : {}),
    ...(serialInstalacao ? { serial_instalacao: serialInstalacao } : {}),
    ...(String(row.nome_completo_contato_extra ?? '').trim() ?
      { nome_completo_contato_extra: String(row.nome_completo_contato_extra).trim() }
    : {}),
  };
}

/** Mesma conta do portal (/player/telemetry) — % faixas ambiente tipo N. */
async function loadCacheDownloadPercent(pool, pdvId, programaId) {
  const progId = Number(programaId);
  if (!Number.isFinite(pdvId) || pdvId <= 0 || !Number.isFinite(progId) || progId <= 0) {
    return null;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS atualizadas (
        id SERIAL PRIMARY KEY,
        pdv_id INT NOT NULL,
        musica_id INT NOT NULL,
        programa_id INT NOT NULL DEFAULT 0,
        percentual INT NOT NULL DEFAULT 100,
        playlist_atualizada CHAR(1) NOT NULL DEFAULT 'S',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (pdv_id, musica_id, programa_id)
      )
    `).catch(() => null);

    const { rows } = await pool.query(
      `SELECT CASE
         WHEN COALESCE(tot.total_musicas, 0) = 0 THEN NULL
         ELSE ROUND(100.0 * COALESCE(dlv.baixadas, 0) / tot.total_musicas)::int
       END AS download_percent
       FROM (SELECT 1) x
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT pm.musica_id)::int AS total_musicas
         FROM playlists pl
         INNER JOIN playlist_musicas pm ON pm.playlist_id = pl.id
         WHERE pl.programa_id = $2
           AND pl.tipo = 'N'
           AND COALESCE(pl.publicado, 'S') = 'S'
           AND (pl.pdv_id IS NULL OR pl.pdv_id = $1)
       ) tot ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT a.musica_id)::int AS baixadas
         FROM atualizadas a
         WHERE a.pdv_id = $1
           AND a.programa_id = $2
           AND a.percentual >= 100
       ) dlv ON true`,
      [pdvId, progId],
    );
    const n = rows[0]?.download_percent;
    if (n == null) return null;
    const rounded = Math.round(Number(n));
    return Number.isFinite(rounded) ? Math.min(100, Math.max(0, rounded)) : null;
  } catch (err) {
    console.error('[ping/cache_percent]', err);
    return null;
  }
}

function buildPingClientePayload(row) {
  return {
    id: row.cliente_id,
    nome: row.cliente_nome,
    status: row.cliente_status ?? 'A',
  };
}

async function gravarVotoMusicaPing(row, req) {
  const musicaGwId = Number.parseInt(String(req.query.voto_musica_id ?? ''), 10);
  const votoRaw = String(req.query.voto ?? '').trim().toLowerCase();
  if (!Number.isFinite(musicaGwId) || musicaGwId <= 0) return;
  if (votoRaw !== 'like' && votoRaw !== 'dislike') return;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT origem_musica_id FROM musicas WHERE id = $1 LIMIT 1`,
    [musicaGwId],
  );
  const bibliotecaId = String(rows[0]?.origem_musica_id ?? '').trim();
  if (!bibliotecaId) return;

  try {
    await portalQuery(
      `INSERT INTO musica_biblioteca_voto
         (id, musica_id, portal_cliente_id, portal_pdv_id, pdv_nome, cliente_nome, voto, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (musica_id, portal_pdv_id) DO UPDATE SET
         voto = EXCLUDED.voto,
         pdv_nome = EXCLUDED.pdv_nome,
         cliente_nome = EXCLUDED.cliente_nome,
         portal_cliente_id = EXCLUDED.portal_cliente_id,
         updated_at = now()`,
      [
        randomUUID(),
        bibliotecaId,
        row.cliente_id,
        row.pdv_id,
        String(row.pdv_nome ?? '').slice(0, 200),
        String(row.cliente_nome ?? '').slice(0, 200),
        votoRaw,
      ],
    );
  } catch (err) {
    console.error('[ping/voto]', err);
  }
}

/** GET /api/ping/ — heartbeat Player 5; devolve flags e atualizacao_pendente. */
export async function registerPingRoutes(app, prefix) {
  app.get(`${prefix}/ping/`, async (req, reply) => {
    const token = String(req.query.token ?? '').trim();
    if (!token) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const row = await loadSessionByToken(token);
    if (!row) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const avaliacao = await avaliarBloqueioReproducao(row);

    /** Cancelado / bloqueio financeiro / inativo — Planilha Rio prevalece; gateway desatualizado é corrigido. */
    if (avaliacao.bloqueado) {
      return reply.send({
        pdv: buildPingPdvPayload({ ...row, pdv_status: 'I' }),
        cliente: buildPingClientePayload({ ...row, cliente_status: 'I' }),
        mensagem: 'pdv_bloqueado',
      });
    }

    const pool = getPool();
    await healGatewayStatusSeNecessario(pool, row, avaliacao);
    const rowAtivo = {
      ...row,
      pdv_status: avaliacao.pdvStatus,
      cliente_status: avaliacao.clienteStatus,
    };
    try {
      await pool.query(
        `INSERT INTO ping_log (pdv_id, ma, ip, versao_player) VALUES ($1, $2, $3, $4)`,
        [rowAtivo.pdv_id, req.query.ma ?? null, req.query.ip ?? null, req.query.versao_player ?? null],
      );
    } catch {
      /* ping_log opcional */
    }

    const versao = String(req.query.versao_player ?? "").trim();
    if (versao) {
      await pool
        .query(
          `UPDATE pdvs SET versao_player = $1, date_last_update = now(), updated_at = now() WHERE id = $2`,
          [versao, rowAtivo.pdv_id],
        )
        .catch(() => null);
    } else {
      await pool
        .query(`UPDATE pdvs SET date_last_update = now(), updated_at = now() WHERE id = $1`, [rowAtivo.pdv_id])
        .catch(() => null);
    }

    if (req.query.pdv_atualizado === '1') {
      await pool
        .query(`UPDATE pdvs SET atualizacao_pendente = 'N' WHERE id = $1`, [rowAtivo.pdv_id])
        .catch(() => null);
      rowAtivo.atualizacao_pendente = 'N';
    }

    if (req.query.forcar_cache_ack === '1') {
      await pool
        .query(`UPDATE pdvs SET forcar_cache_completo = 'N' WHERE id = $1`, [rowAtivo.pdv_id])
        .catch(() => null);
      rowAtivo.forcar_cache_completo = 'N';
    }

    await gravarVotoMusicaPing(rowAtivo, req);

    const avisoResolvido = String(req.query.aviso_resolvido ?? '').trim();
    if (avisoResolvido === 'cadastro_loja' || avisoResolvido === 'cadastro_financeiro') {
      await resolverAvisoAutomatizadoPorGatewayPdv(rowAtivo.pdv_id, avisoResolvido);
    }

    const cacheDownloadPercent = await loadCacheDownloadPercent(
      pool,
      rowAtivo.pdv_id,
      rowAtivo.programa_id,
    );

    return reply.send({
      pdv: buildPingPdvPayload(rowAtivo, { cache_download_percent: cacheDownloadPercent }),
      cliente: buildPingClientePayload(rowAtivo),
      mensagem: 'ping_salvo',
    });
  });
}
