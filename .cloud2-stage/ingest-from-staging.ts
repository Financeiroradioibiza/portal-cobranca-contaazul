import type { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import { portalQuery } from '../../criacao/portalDb.js';
import { assertValidMp3File } from '../../criacao/mp3Validate.js';
import {
  downloadStagingPath,
  downloadStagingRelFromKey,
  ensureStorageDirs,
  uploadKey,
  uploadPath,
} from '../../criacao/storage.js';
import { cleanupDownloadStagingFile } from '../../criacao/storageCleanup.js';

type Pair = { processamentoItemId: string; downloadItemId: string };

function verifySecret(authHeader: string | undefined): boolean {
  const secret = process.env.CRIACAO_CLOUD2_DOWNLOAD_SECRET ?? '';
  if (!secret) return true;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  return token === secret;
}

/** POST /criacao/ingest-from-staging — copia MP3 de download-staging → upload (sem passar pelo browser). */
export async function registerIngestFromStagingRoutes(
  app: FastifyInstance,
  prefix: string,
): Promise<void> {
  app.post<{ Body: { pairs?: Pair[] } }>(`${prefix}/ingest-from-staging`, async (req, reply) => {
    if (!verifySecret(req.headers.authorization)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }

    const pairs = Array.isArray(req.body?.pairs) ? req.body.pairs : [];
    if (pairs.length === 0) {
      return reply.send({ ok: true, imported: 0, errors: [] });
    }

    ensureStorageDirs();
    const errors: string[] = [];
    let imported = 0;

    for (const pair of pairs.slice(0, 100)) {
      const processamentoItemId = String(pair.processamentoItemId ?? '').trim();
      const downloadItemId = String(pair.downloadItemId ?? '').trim();
      if (!processamentoItemId || !downloadItemId) {
        errors.push('par_invalido');
        continue;
      }

      try {
        const itemRes = await portalQuery<{ id: string; job_id: string; status: string }>(
          `SELECT id, job_id, status::text AS status
             FROM processamento_item
            WHERE id = $1
            LIMIT 1`,
          [processamentoItemId],
        );
        const procItem = itemRes.rows[0];
        if (!procItem) {
          errors.push(`${processamentoItemId}: item_upload_nao_encontrado`);
          continue;
        }
        if (procItem.status !== 'aguardando' && procItem.status !== 'processando') {
          errors.push(`${processamentoItemId}: item_ja_processado`);
          continue;
        }

        const dlRes = await portalQuery<{
          id: string;
          status: string;
          storage_key: string | null;
          provider_ref: string;
        }>(
          `SELECT id, status::text AS status, storage_key, provider_ref
             FROM download_item
            WHERE id = $1
            LIMIT 1`,
          [downloadItemId],
        );
        const dlItem = dlRes.rows[0];
        if (!dlItem?.storage_key) {
          errors.push(`${downloadItemId}: download_nao_encontrado`);
          continue;
        }
        if (dlItem.status !== 'concluido') {
          errors.push(`${downloadItemId}: download_nao_concluido`);
          continue;
        }
        if (dlItem.provider_ref.startsWith('import:')) {
          errors.push(`${downloadItemId}: download_ja_importado`);
          continue;
        }

        const src = downloadStagingPath(downloadItemId);
        try {
          await fsp.access(src);
        } catch {
          const rel = downloadStagingRelFromKey(dlItem.storage_key);
          errors.push(`${downloadItemId}: arquivo_ausente${rel ? ` (${rel})` : ''}`);
          continue;
        }

        try {
          await assertValidMp3File(src);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'mp3_invalido';
          errors.push(`${downloadItemId}: ${msg}`);
          continue;
        }

        const dest = uploadPath(processamentoItemId);
        await fsp.copyFile(src, dest);
        const key = uploadKey(processamentoItemId);

        await portalQuery(
          `UPDATE processamento_item
              SET raw_storage_key = $2, status = 'aguardando', etapa_atual = 'deduplicacao',
                  updated_at = now()
            WHERE id = $1`,
          [processamentoItemId, key],
        );
        await portalQuery(
          `UPDATE processamento_job
              SET status = 'aguardando', etapa_atual = 'deduplicacao', updated_at = now()
            WHERE id = $1 AND status = 'aguardando'`,
          [procItem.job_id],
        );
        await portalQuery(
          `UPDATE download_item
              SET provider_ref = $2, updated_at = now()
            WHERE id = $1`,
          [downloadItemId, `import:${processamentoItemId}`],
        );

        await cleanupDownloadStagingFile(downloadItemId);

        imported += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'erro';
        errors.push(`${downloadItemId}: ${msg}`);
      }
    }

    app.log.info({ imported, errors: errors.length }, '[ingest-from-staging]');
    return reply.send({ ok: errors.length === 0 || imported > 0, imported, errors });
  });
}
