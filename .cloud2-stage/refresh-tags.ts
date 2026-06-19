import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { criacaoConfig } from '../../criacao/config.js';
import { refreshInternetTagsForMusica } from '../../workers/criacao/tags.js';

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

/** POST /criacao/biblioteca/:musicaId/refresh-tags — reconsulta Deezer/MB só desta faixa. */
export async function registerRefreshTagsRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.post<{ Params: { musicaId: string } }>(
    `${prefix}/biblioteca/:musicaId/refresh-tags`,
    async (req, reply) => {
      if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });

      const musicaId = String(req.params.musicaId ?? '').trim();
      if (!musicaId) return reply.code(400).send({ ok: false, error: 'id_obrigatorio' });

      try {
        const result = await refreshInternetTagsForMusica(musicaId);
        return reply.send({ ok: true, musicaId, ...result });
      } catch (e) {
        if (e instanceof Error && e.message === 'not_found') {
          return reply.code(404).send({ ok: false, error: 'nao_encontrada' });
        }
        throw e;
      }
    },
  );
}
