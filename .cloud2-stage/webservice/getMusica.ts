import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { getPool } from '../../db/pool.js';
import { usoPath } from '../../criacao/storage.js';
import { loadSessionByToken } from '../loginByToken.js';

type GetMusicaQuery = { token?: string; id_musica?: string; playlist_id?: string };

/**
 * GET /get_musica/ — entrega o MP3 processado DIRETO do cloud2 (nunca pelo Netlify).
 * O player toca a URL diretamente; corte_seg (ponto de mix) vai no /playlist/.
 */
export async function registerGetMusicaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get<{ Querystring: GetMusicaQuery }>(`${prefix}/get_musica/`, async (req, reply) => {
    const token = String(req.query.token ?? '').trim();
    const idMusica = Number(req.query.id_musica);
    if (!token || !Number.isFinite(idMusica) || idMusica <= 0) {
      return reply.code(400).send({ mensagem: 'parametros_invalidos' });
    }

    const session = await loadSessionByToken(token);
    if (!session) {
      return reply.code(401).send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    const r = await pool.query<{ storage_key: string | null }>(
      `SELECT storage_key FROM musicas WHERE id = $1 LIMIT 1`,
      [idMusica],
    );
    const key = r.rows[0]?.storage_key;
    if (!key) return reply.code(404).send({ mensagem: 'musica_nao_encontrada' });

    const rel = key.startsWith('uso:') ? key.slice(4) : key;
    const full = usoPath(rel);
    const stat = await fsp.stat(full).catch(() => null);
    if (!stat) return reply.code(404).send({ mensagem: 'arquivo_ausente' });

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', 'audio/mpeg');
    reply.header('Cache-Control', 'public, max-age=86400');

    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= stat.size) end = stat.size - 1;
      if (start > end) return reply.code(416).header('Content-Range', `bytes */${stat.size}`).send();
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      reply.header('Content-Length', String(end - start + 1));
      return reply.send(fs.createReadStream(full, { start, end }));
    }

    reply.header('Content-Length', String(stat.size));
    return reply.send(fs.createReadStream(full));
  });
}
