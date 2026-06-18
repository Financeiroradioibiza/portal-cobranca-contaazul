import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { portalQuery } from '../../criacao/portalDb.js';
import { criacaoConfig } from '../../criacao/config.js';
import { extractGravadoraFromTags, parseTagsFromJson } from './tagEnrichmentCore.js';
import { enrichMusicaLabelsById } from './workers/criacao/tags.js';

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

/** POST /criacao/enriquecer-tags — batch label enrichment (MusicBrainz + Deezer). */
export async function registerEnriquecerTagsRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.post<{ Body: { limit?: number; musicaIds?: string[]; onlyMissing?: boolean } }>(
    `${prefix}/enriquecer-tags`,
    async (req, reply) => {
      if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });

      const limit = Math.min(100, Math.max(1, Number(req.body?.limit) || 25));
      const ids = Array.isArray(req.body?.musicaIds) ? req.body!.musicaIds!.filter(Boolean) : [];
      const onlyMissing = req.body?.onlyMissing !== false;

      let musicaIds: string[];
      if (ids.length > 0) {
        musicaIds = ids.slice(0, limit);
      } else {
        const r = await portalQuery<{ id: string; tags_auto: unknown }>(
          `SELECT id, tags_auto FROM musica_biblioteca
            WHERE status = 'pronta'
            ORDER BY updated_at DESC
            LIMIT $1`,
          [limit * 4],
        );
        musicaIds = r.rows
          .filter((row) => {
            if (!onlyMissing) return true;
            return !extractGravadoraFromTags(parseTagsFromJson(row.tags_auto));
          })
          .slice(0, limit)
          .map((row) => row.id);
      }

      let updated = 0;
      for (const id of musicaIds) {
        try {
          const r = await enrichMusicaLabelsById(id);
          if (r.updated) updated += 1;
        } catch {
          /* skip */
        }
      }

      return reply.send({ ok: true, processed: musicaIds.length, updated });
    },
  );
}
