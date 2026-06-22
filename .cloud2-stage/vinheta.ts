import type { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { criacaoConfig } from '../../criacao/config.js';
import { verifyVinhetaStreamAccess, verifyVinhetaToken } from '../../criacao/ingestToken.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { resolveUsoAudio, sendAudioReply } from '../../criacao/audioDelivery.js';
import { ensureStorageDirs, vinhetaPath, vinhetaStorageKey } from '../../criacao/storage.js';

const MAX_VINHETA_BYTES = Number(process.env.CRIACAO_MAX_VINHETA_BYTES ?? String(20 * 1024 * 1024));

type VinhetaAudioParams = { vinhetaId: string };
type VinhetaAudioQuery = { exp?: string; token?: string };

/** Upload e preview de vinhetas de áudio (spots) — direto no cloud2. */
export async function registerVinhetaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  if (!app.hasDecorator('multipartErrors')) {
    const multipart = await import('@fastify/multipart');
    await app.register(multipart.default, {
      limits: { fileSize: Math.min(criacaoConfig.maxUploadBytes, MAX_VINHETA_BYTES), files: 1, fields: 10 },
    });
  }

  app.post(`${prefix}/vinheta-ingest`, async (req, reply) => {
    let token = '';
    let fileBuffer: Buffer | null = null;
    let fileName = 'vinheta.mp3';

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
    const parsed = verifyVinhetaToken(token);
    if (!parsed) return reply.code(401).send({ ok: false, error: 'token_invalido' });
    if (!fileBuffer?.length) return reply.code(400).send({ ok: false, error: 'arquivo_ausente' });

    const ext = path.extname(fileName).toLowerCase();
    if (ext && ext !== '.mp3') {
      return reply.code(400).send({ ok: false, error: 'formato_invalido' });
    }

    const vinhetaRes = await portalQuery<{ id: string; tipo: string }>(
      `SELECT id, tipo::text AS tipo FROM vinheta WHERE id = $1 LIMIT 1`,
      [parsed.vinhetaId],
    );
    const vinheta = vinhetaRes.rows[0];
    if (!vinheta) return reply.code(404).send({ ok: false, error: 'vinheta_nao_encontrada' });

    ensureStorageDirs();
    const dest = vinhetaPath(parsed.vinhetaId);
    await fsp.writeFile(dest, fileBuffer);

    const key = vinhetaStorageKey(parsed.vinhetaId);
    await portalQuery(
      `UPDATE vinheta
          SET storage_key = $2, updated_at = now()
        WHERE id = $1`,
      [parsed.vinhetaId, key],
    );

    app.log.info(
      { vinhetaId: parsed.vinhetaId, fileName, bytes: fileBuffer.length, tipo: vinheta.tipo },
      '[vinheta-ingest] ok',
    );
    return reply.send({ ok: true, vinhetaId: parsed.vinhetaId, bytes: fileBuffer.length, storageKey: key });
  });

  app.get<{ Params: VinhetaAudioParams; Querystring: VinhetaAudioQuery }>(
    `${prefix}/vinheta-audio/:vinhetaId`,
    async (req, reply) => {
      const vinhetaId = String(req.params.vinhetaId ?? '').trim();
      const exp = Number(req.query.exp);
      const sig = String(req.query.token ?? '').trim();

      if (!vinhetaId || !verifyVinhetaStreamAccess(vinhetaId, exp, sig)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      const r = await portalQuery<{ storage_key: string | null }>(
        `SELECT storage_key FROM vinheta WHERE id = $1 LIMIT 1`,
        [vinhetaId],
      );
      const key = r.rows[0]?.storage_key;
      if (!key) return reply.code(404).send({ ok: false, error: 'audio_ausente' });

      const resolved = await resolveUsoAudio(key);
      if (!resolved) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

      return sendAudioReply(reply, resolved, req.headers.range, 'private, max-age=3600');
    },
  );
}
