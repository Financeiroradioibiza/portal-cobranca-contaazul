import type { FastifyInstance } from 'fastify';
import { getPool } from '../../db/pool.js';
import { resolveUsoAudio, sendAudioReply } from '../../criacao/audioDelivery.js';
import { loadSessionByToken } from '../loginByToken.js';

type GetMusicaQuery = { token?: string; id_musica?: string; playlist_id?: string };

/**
 * GET /get_musica/ — entrega o MP3 processado DIRETO do cloud2 (nunca pelo Netlify).
 * Suporta .mp3 plano e .rib (AES-256-GCM). Corte_seg (ponto de mix) vai no /playlist/.
 */
export async function registerGetMusicaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get<{ Querystring: GetMusicaQuery }>(`${prefix}/get_musica/`, async (req, reply) => {
    const token = String(req.query.token ?? '').trim();
    const idMusica = Number(req.query.id_musica);
    if (!token || !Number.isFinite(idMusica) || idMusica <= 0) {
      return reply.code(400).send({ mensagem: 'parametros_invalidos' });
    }

    const session = await loadSessionByToken(token);
    if (!session) {
      return reply.code(401).send({ mensagem: 'token_invalido' });
    }

    const pool = getPool();
    const r = await pool.query<{ storage_key: string | null }>(
      `SELECT storage_key FROM musicas WHERE id = $1 LIMIT 1`,
      [idMusica],
    );
    const key = r.rows[0]?.storage_key;
    if (!key) return reply.code(404).send({ mensagem: 'musica_nao_encontrada' });

    const resolved = await resolveUsoAudio(key);
    if (!resolved) return reply.code(404).send({ mensagem: 'arquivo_ausente' });

    return sendAudioReply(reply, resolved, req.headers.range, 'public, max-age=86400');
  });
}
