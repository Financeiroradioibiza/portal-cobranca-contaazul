import type { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import { verifyUploadStreamToken } from '../../criacao/ingestToken.js';
import { sendAudioReply } from '../../criacao/audioDelivery.js';
import { downloadStagingPath } from '../../criacao/storage.js';

type StagingAudioParams = { itemId: string };
type StagingAudioQuery = { exp?: string; token?: string };

/** GET /criacao/staging-audio/:itemId?exp=…&token=… — preview do MP3 em download-staging (Deemix). */
export async function registerStagingAudioRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get<{ Params: StagingAudioParams; Querystring: StagingAudioQuery }>(
    `${prefix}/staging-audio/:itemId`,
    async (req, reply) => {
      const itemId = String(req.params.itemId ?? '').trim();
      const exp = Number(req.query.exp);
      const sig = String(req.query.token ?? '').trim();

      if (!itemId || !verifyUploadStreamToken(itemId, exp, sig)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      const filePath = downloadStagingPath(itemId);
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

      return sendAudioReply(
        reply,
        { filePath, mp3Buffer: null, contentLength: stat.size },
        req.headers.range,
        'private, max-age=3600',
      );
    },
  );
}
