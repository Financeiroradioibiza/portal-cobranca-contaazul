import type { FastifyInstance } from 'fastify';
import { verifyStreamToken } from '../../criacao/ingestToken.js';
import { resolveMusicaUsoAudioById, sendAudioReply } from '../../criacao/audioDelivery.js';

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

      try {
        const resolved = await resolveMusicaUsoAudioById(musicaId, formato);
        if (!resolved) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });
        return sendAudioReply(reply, resolved, req.headers.range, 'private, max-age=3600');
      } catch (e) {
        req.log.error({ err: e, musicaId, formato }, 'audio_stream_falhou');
        return reply.code(503).send({ ok: false, error: 'stream_indisponivel' });
      }
    },
  );
}
