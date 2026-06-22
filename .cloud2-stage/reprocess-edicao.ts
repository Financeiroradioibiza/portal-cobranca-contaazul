import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { criacaoConfig } from '../../criacao/config.js';
import { reprocessMusicaEdicao } from '../../criacao/reprocessEdicao.js';

function authorized(req: { headers: Record<string, unknown> }): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret) return false;
  const got = String(req.headers['x-criacao-secret'] ?? '');
  if (got.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  } catch {
    return false;
  }
}

/** POST /criacao/reprocess-edicao — aplica trim gravado na edição à versão de uso (MP3). */
export async function registerReprocessEdicaoRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.post<{ Body: { musicaId?: string } }>(`${prefix}/reprocess-edicao`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    const musicaId = String(req.body?.musicaId ?? '').trim();
    if (!musicaId) return reply.code(400).send({ ok: false, error: 'parametros_invalidos' });

    try {
      const result = await reprocessMusicaEdicao(musicaId);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      app.log.error({ err: e, musicaId }, '[reprocess-edicao] falhou');
      if (detail === 'musica_nao_encontrada') return reply.code(404).send({ ok: false, error: detail });
      if (detail === 'fonte_ausente') return reply.code(404).send({ ok: false, error: detail });
      return reply.code(500).send({ ok: false, error: 'reprocess_falhou', detail });
    }
  });
}
