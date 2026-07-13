import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { criacaoConfig } from '../../criacao/config.js';
import {
  cleanupAfterItemPersisted,
  cleanupProcessamentoItemScratch,
  runStorageGarbageCollect,
} from '../../criacao/storageCleanup.js';

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

/** POST /criacao/cleanup/scratch — remove upload/work (e staging importado) de itens terminalizados. */
export async function registerCleanupScratchRoutes(
  app: FastifyInstance,
  prefix: string,
): Promise<void> {
  app.post<{ Body: { itemIds?: string[]; runGc?: boolean } }>(
    `${prefix}/cleanup/scratch`,
    async (req, reply) => {
      if (!authorized(req)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      if (req.body?.runGc) {
        const stats = await runStorageGarbageCollect();
        return reply.send({ ok: true, gc: stats });
      }

      const itemIds = Array.isArray(req.body?.itemIds) ?
          req.body.itemIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const results: Array<{ itemId: string; removed: string[] }> = [];
      for (const itemId of itemIds.slice(0, 100)) {
        const r = await cleanupAfterItemPersisted(itemId);
        results.push({ itemId, removed: r.removed });
      }
      return reply.send({ ok: true, results });
    },
  );

  app.post(`${prefix}/cleanup/gc`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    const stats = await runStorageGarbageCollect();
    return reply.send({ ok: true, ...stats });
  });
}

export { cleanupProcessamentoItemScratch };
