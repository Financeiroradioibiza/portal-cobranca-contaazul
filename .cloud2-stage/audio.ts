import type { FastifyInstance } from 'fastify';
import { verifyStreamToken } from '../../criacao/ingestToken.js';
import { resolveUsoAudio, sendAudioReply } from '../../criacao/audioDelivery.js';
import { portalQuery } from '../../criacao/portalDb.js';

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

      const resolved = await resolveUsoAudio(key);
      if (!resolved) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

      return sendAudioReply(reply, resolved, req.headers.range, 'private, max-age=3600');
    },
  );
}
