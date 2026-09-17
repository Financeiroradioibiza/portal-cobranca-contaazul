import type { FastifyInstance } from 'fastify';
import { verifyMaster192StreamToken } from '../../criacao/ingestToken.js';
import { resolveMaster192Buffer } from '../../criacao/masterAudio.js';

type MasterParams = { musicaId: string };
type MasterQuery = { exp?: string; token?: string };

/** GET /criacao/master/:musicaId?exp=…&token=… — master 192k do B2 (download playlist). */
export async function registerMasterAudioRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get<{ Params: MasterParams; Querystring: MasterQuery }>(
    `${prefix}/master/:musicaId`,
    async (req, reply) => {
      const musicaId = String(req.params.musicaId ?? '').trim();
      const exp = Number(req.query.exp);
      const sig = String(req.query.token ?? '').trim();

      if (!musicaId || !verifyMaster192StreamToken(musicaId, exp, sig)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      try {
        const buf = await resolveMaster192Buffer(musicaId);
        if (!buf) return reply.code(404).send({ ok: false, error: 'master_ausente' });
        reply.header('Content-Type', 'audio/mpeg');
        reply.header('Content-Length', String(buf.length));
        reply.header('Cache-Control', 'private, max-age=300');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(buf);
      } catch (e) {
        req.log.error({ err: e, musicaId }, 'master_stream_falhou');
        return reply.code(503).send({ ok: false, error: 'stream_indisponivel' });
      }
    },
  );
}
