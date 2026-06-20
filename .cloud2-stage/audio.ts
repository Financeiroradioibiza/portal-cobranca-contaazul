import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { verifyStreamToken } from '../../criacao/ingestToken.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { usoPath, usoRelFromStorageKey } from '../../criacao/storage.js';

type AudioParams = { musicaId: string };
type AudioQuery = { f?: string; exp?: string; token?: string };

const FORMATO_FALLBACK = 'mp3_128_mono';

/** GET /criacao/audio/:musicaId?f=mp3_128_mono&exp=…&token=… */
export async function registerAudioRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get<{ Params: AudioParams; Querystring: AudioQuery }>(
    `${prefix}/audio/:musicaId`,
    async (req, reply) => {
      const musicaId = String(req.params.musicaId ?? '').trim();
      const formato = String(req.query.f ?? FORMATO_FALLBACK).trim();
      const exp = Number(req.query.exp);
      const sig = String(req.query.token ?? '').trim();

      if (!musicaId || !verifyStreamToken(musicaId, formato, exp, sig)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      const r = await portalQuery<{ storage_key: string }>(
        `SELECT storage_key FROM musica_versao
          WHERE musica_id = $1 AND formato::text = $2
          LIMIT 1`,
        [musicaId, formato],
      );
      let key = r.rows[0]?.storage_key;
      if (!key) {
        const fb = await portalQuery<{ storage_key: string }>(
          `SELECT storage_key FROM musica_versao
            WHERE musica_id = $1 AND formato::text = $2
            LIMIT 1`,
          [musicaId, FORMATO_FALLBACK],
        );
        key = fb.rows[0]?.storage_key;
      }
      if (!key) return reply.code(404).send({ ok: false, error: 'versao_ausente' });

      const rel = usoRelFromStorageKey(key);
      const full = usoPath(rel);
      const stat = await fsp.stat(full).catch(() => null);
      if (!stat) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Cache-Control', 'private, max-age=3600');

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
    },
  );
}
