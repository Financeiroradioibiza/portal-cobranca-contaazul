import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from '../loginByToken.js';

const OK = { mensagem: 'save_musica_ok' };

async function ensureAtualizadasTable(pool) {
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
  `);
}

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractMusicaIds(req) {
  const ids = new Set();

  const single = parsePositiveInt(req.query?.musica_id);
  if (single != null) ids.add(single);

  const qList = req.query?.['musicas[]'] ?? req.query?.musicas;
  if (Array.isArray(qList)) {
    for (const v of qList) {
      const n = parsePositiveInt(v);
      if (n != null) ids.add(n);
    }
  } else if (qList != null) {
    const n = parsePositiveInt(qList);
    if (n != null) ids.add(n);
  }

  const body = req.body;
  if (body && typeof body === 'object') {
    const bList = body['musicas[]'] ?? body.musicas;
    if (Array.isArray(bList)) {
      for (const v of bList) {
        const n = parsePositiveInt(v);
        if (n != null) ids.add(n);
      }
    } else if (bList != null) {
      const n = parsePositiveInt(bList);
      if (n != null) ids.add(n);
    }
  }

  return [...ids];
}

async function upsertAtualizada(pool, pdvId, musicaId, programaId, percentual, playlistAtualizada) {
  await pool.query(
    `INSERT INTO atualizadas (pdv_id, musica_id, programa_id, percentual, playlist_atualizada, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (pdv_id, musica_id, programa_id) DO UPDATE SET
       percentual = EXCLUDED.percentual,
       playlist_atualizada = EXCLUDED.playlist_atualizada,
       updated_at = now()`,
    [pdvId, musicaId, programaId, percentual, playlistAtualizada],
  );
}

async function handleSaveAtualizadas(req, reply) {
  const token = String(req.query?.token ?? req.body?.token ?? '').trim();
  if (!token) return reply.send({ mensagem: 'token_invalido' });

  const session = await loadSessionByToken(token);
  if (!session || session.pdv_status === 'I') {
    return reply.send({ mensagem: 'token_invalido' });
  }

  const pool = getPool();
  await ensureAtualizadasTable(pool);

  const programaId = parsePositiveInt(req.query?.id_programa) ?? 0;
  const percentualRaw = Number.parseInt(String(req.query?.percentual ?? '100'), 10);
  const percentual = Number.isFinite(percentualRaw) ? Math.min(100, Math.max(0, percentualRaw)) : 100;
  const playlistAtualizada =
    String(req.query?.playlist_atualizada ?? 'S').trim().toUpperCase() === 'N' ? 'N' : 'S';

  const musicaIds = extractMusicaIds(req);
  if (musicaIds.length === 0) return reply.send(OK);

  for (const musicaId of musicaIds) {
    await upsertAtualizada(
      pool,
      session.pdv_id,
      musicaId,
      programaId,
      percentual,
      playlistAtualizada,
    );
  }

  return reply.send(OK);
}

/** GET/POST /api/save_atualizadas/ — progresso de download (barra % no painel). */
export async function registerSaveAtualizadasRoutes(app, prefix) {
  const path = `${prefix}/save_atualizadas/`;
  app.get(path, handleSaveAtualizadas);
  app.post(path, handleSaveAtualizadas);
}
