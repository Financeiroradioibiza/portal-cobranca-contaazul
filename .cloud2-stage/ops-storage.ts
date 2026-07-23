import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { criacaoConfig } from '../../criacao/config.js';
import { collectOpsStorageSnapshot } from '../../criacao/opsStorage.js';
import { collectOrphanStorageReport } from '../../criacao/orphanStorage.js';
import { runB2StorageAudit, verifyMusicaOnB2 } from '../../criacao/b2Audit.js';

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

  app.get<{ Querystring: { limit?: string } }>(`${prefix}/ops/b2-audit`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    try {
      const limitRaw = req.query.limit;
      const limitParsed = limitRaw != null ? Number(limitRaw) : NaN;
      const report = await runB2StorageAudit(
        Number.isFinite(limitParsed) && limitParsed > 0 ? { limit: limitParsed } : undefined,
      );
      return reply.send(report);
    } catch (e) {
      app.log.error(e, '[ops/b2-audit]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });

  app.get<{ Params: { musicaId: string } }>(
    `${prefix}/ops/b2-verify/:musicaId`,
    async (req, reply) => {
      if (!authorized(req)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }
      const musicaId = String(req.params.musicaId ?? '').trim();
      if (!musicaId) return reply.code(400).send({ ok: false, error: 'id_obrigatorio' });
      try {
        const report = await verifyMusicaOnB2(musicaId);
        const verifiedOk = report.master.ok && report.uso128.ok;
        return reply.send({ ...report, ok: verifiedOk });
      } catch (e) {
        app.log.error(e, '[ops/b2-verify]');
        return reply.code(500).send({
          ok: false,
          error: e instanceof Error ? e.message : 'erro',
        });
      }
    },
  );

  app.get(`${prefix}/ops/orphans`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    try {
      const report = await collectOrphanStorageReport();
      return reply.send(report);
    } catch (e) {
      app.log.error(e, '[ops/orphans]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });
}
