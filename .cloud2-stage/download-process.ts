import type { FastifyInstance } from 'fastify';
import { criacaoConfig } from '../../criacao/config.js';
import { processPendingDownloads } from '../../criacao/downloadProcessor.js';
import { restoreDownloadStagingKeysFromDisk } from '../../criacao/storageCleanup.js';

type Body = { limit?: number };
type RestoreBody = { jobId?: string; limit?: number };

function verifySecret(authHeader: string | undefined): boolean {
  const secret = process.env.CRIACAO_CLOUD2_DOWNLOAD_SECRET ?? '';
  if (!secret) return true;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  return token === secret;
}

/** POST /criacao/download/process — worker de download (Spotizerr / Deemix / YouTube). */
export async function registerDownloadProcessRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.post<{ Body: Body }>(`${prefix}/download/process`, async (req, reply) => {
    if (!verifySecret(req.headers.authorization)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }

    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    try {
      const processed = await processPendingDownloads(limit);
      return reply.send({ ok: true, processed });
    } catch (e) {
      app.log.error(e, '[download/process]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });

  app.get(`${prefix}/download/health`, async (_req, reply) => {
    return reply.send({
      ok: true,
      storageRoot: criacaoConfig.storageRoot,
      spotizerr: Boolean(process.env.CRIACAO_SPOTIZERR_URL),
      deemix: Boolean(process.env.CRIACAO_DEEMIX_ARL),
      youtube: Boolean(process.env.CRIACAO_YOUTUBE_DL_URL),
    });
  });

  app.post<{ Body: RestoreBody }>(`${prefix}/download/restore-staging`, async (req, reply) => {
    if (!verifySecret(req.headers.authorization)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    const jobId = (req.body?.jobId ?? '').trim() || undefined;
    const limit = Math.min(500, Math.max(1, Number(req.body?.limit) || 400));
    try {
      const result = await restoreDownloadStagingKeysFromDisk({ jobId, limit });
      return reply.send({ ok: true, ...result });
    } catch (e) {
      app.log.error(e, '[download/restore-staging]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });
}
