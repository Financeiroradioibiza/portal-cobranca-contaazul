import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { criacaoConfig } from '../../criacao/config.js';
import { deleteB2ObjectKey } from '../../criacao/b2.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { masterLocalPath, s3KeyFromVersaoStorageKey, usoPath } from '../../criacao/storage.js';

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

function relFromUsoKey(key: string): string {
  return key.startsWith('uso:') ? key.slice(4) : key;
}

async function deleteB2Object(objectKey: string): Promise<boolean> {
  return deleteB2ObjectKey(objectKey);
}

async function deleteMasterStorageKey(masterKey: string | null): Promise<string[]> {
  const removed: string[] = [];
  if (!masterKey?.trim()) return removed;

  if (masterKey.startsWith('b2:')) {
    const key = masterKey.slice(3);
    if (await deleteB2Object(key)) removed.push(`b2:${key}`);
    return removed;
  }

  if (masterKey.startsWith('local:')) {
    const base = masterKey.slice(6);
    const musicaId = base.replace(/\.mp3$/i, '');
    const full = masterLocalPath(musicaId);
    await fsp.rm(full, { force: true }).catch(() => {});
    removed.push(masterKey);
    return removed;
  }

  if (masterKey.includes('/') && masterKey.endsWith('.mp3')) {
    if (await deleteB2Object(masterKey)) removed.push(masterKey);
  }

  return removed;
}

async function deleteUsoStorageKey(storageKey: string): Promise<boolean> {
  const b2Key = s3KeyFromVersaoStorageKey(storageKey);
  if (b2Key) {
    return deleteB2Object(b2Key);
  }
  const rel = relFromUsoKey(storageKey);
  const full = usoPath(rel);
  try {
    await fsp.rm(full, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** DELETE /criacao/biblioteca/:musicaId — remove arquivos de uso + master no cloud2/B2. */
export async function registerApagarMusicaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.delete<{ Params: { musicaId: string } }>(
    `${prefix}/biblioteca/:musicaId`,
    async (req, reply) => {
      if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });

      const musicaId = String(req.params.musicaId ?? '').trim();
      if (!musicaId) return reply.code(400).send({ ok: false, error: 'id_obrigatorio' });

      const musica = await portalQuery<{ master_storage_key: string | null }>(
        `SELECT master_storage_key FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
        [musicaId],
      );
      if (!musica.rows[0]) return reply.code(404).send({ ok: false, error: 'nao_encontrada' });

      const versoes = await portalQuery<{ storage_key: string }>(
        `SELECT storage_key FROM musica_versao WHERE musica_id = $1`,
        [musicaId],
      );

      const removed: string[] = [];
      for (const v of versoes.rows) {
        if (v.storage_key && (await deleteUsoStorageKey(v.storage_key))) {
          removed.push(v.storage_key);
        }
      }

      const usoDir = path.join(criacaoConfig.storageRoot, 'uso', 'musicas', musicaId);
      await fsp.rm(usoDir, { recursive: true, force: true }).catch(() => {});

      removed.push(...(await deleteMasterStorageKey(musica.rows[0].master_storage_key)));

      return reply.send({ ok: true, musicaId, removed });
    },
  );
}
