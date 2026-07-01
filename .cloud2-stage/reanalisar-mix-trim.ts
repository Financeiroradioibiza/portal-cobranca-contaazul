import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { criacaoConfig } from '../../criacao/config.js';
import { reanalisarMixTrimBulk } from '../../criacao/reanalisarMixTrim.js';

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

/** POST /criacao/reanalisar-mix-trim — detecta ponto de mix e trim a partir do upload bruto. */
export async function registerReanalisarMixTrimRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.post<{ Body: { musicaIds?: string[] } }>(`${prefix}/reanalisar-mix-trim`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    const ids = Array.isArray(req.body?.musicaIds) ? req.body!.musicaIds! : [];
    if (ids.length === 0) return reply.code(400).send({ ok: false, error: 'parametros_invalidos' });

    const results = await reanalisarMixTrimBulk(ids);
    const okCount = results.filter((r) => r.ok).length;
    return reply.send({ ok: okCount > 0, okCount, failCount: results.length - okCount, results });
  });
}
