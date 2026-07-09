import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { criacaoConfig } from '../../criacao/config.js';
import { collectOpsStorageSnapshot } from '../../criacao/opsStorage.js';

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

/** GET /criacao/ops/storage — disco NVMe + buckets R2/B2 (autenticado). */
export async function registerOpsStorageRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get(`${prefix}/ops/storage`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    try {
      const snapshot = await collectOpsStorageSnapshot();
      return reply.send(snapshot);
    } catch (e) {
      app.log.error(e, '[ops/storage]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });
}
