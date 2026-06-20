import type { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import { verifyIngestToken } from '../../criacao/ingestToken.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { ensureStorageDirs, uploadKey, uploadPath } from '../../criacao/storage.js';

/** Requer @fastify/multipart no portal-ibiza (`npm i @fastify/multipart`). */
export async function registerIngestRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  const multipart = await import('@fastify/multipart');
  await app.register(multipart.default, {
    limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  });

  app.post(`${prefix}/ingest`, async (req, reply) => {
    let token = '';
    let fileBuffer: Buffer | null = null;
    let fileName = 'upload.mp3';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'token') {
        token = String(part.value ?? '').trim();
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileName = part.filename || fileName;
        fileBuffer = await part.toBuffer();
      }
    }

    if (!token) return reply.code(400).send({ ok: false, error: 'token_ausente' });
    const parsed = verifyIngestToken(token);
    if (!parsed) return reply.code(401).send({ ok: false, error: 'token_invalido' });
    if (!fileBuffer?.length) return reply.code(400).send({ ok: false, error: 'arquivo_ausente' });

    const itemRes = await portalQuery<{ id: string; job_id: string; status: string }>(
      `SELECT id, job_id, status::text AS status
         FROM processamento_item
        WHERE id = $1 AND job_id = $2
        LIMIT 1`,
      [parsed.itemId, parsed.jobId],
    );
    const item = itemRes.rows[0];
    if (!item) return reply.code(404).send({ ok: false, error: 'item_nao_encontrado' });
    if (item.status !== 'aguardando' && item.status !== 'processando') {
      return reply.code(409).send({ ok: false, error: 'item_ja_processado' });
    }

    ensureStorageDirs();
    const dest = uploadPath(parsed.itemId);
    await fsp.writeFile(dest, fileBuffer);

    const key = uploadKey(parsed.itemId);
    await portalQuery(
      `UPDATE processamento_item
          SET raw_storage_key = $2, status = 'aguardando', etapa_atual = 'deduplicacao',
              updated_at = now()
        WHERE id = $1`,
      [parsed.itemId, key],
    );
    await portalQuery(
      `UPDATE processamento_job
          SET status = 'aguardando', etapa_atual = 'deduplicacao', updated_at = now()
        WHERE id = $1 AND status = 'aguardando'`,
      [parsed.jobId],
    );

    app.log.info({ itemId: parsed.itemId, fileName, bytes: fileBuffer.length }, '[ingest] ok');
    return reply.send({ ok: true, itemId: parsed.itemId, bytes: fileBuffer.length });
  });
}
