import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { criacaoConfig } from './config.js';
import { portalQuery } from './portalDb.js';
import {
  downloadStagingPath,
  uploadPath,
  workDir,
} from './storage.js';

export type CleanupResult = {
  removed: string[];
  skipped: string[];
};

function logCleanup(action: string, detail: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: 'criacao-storage-cleanup',
      action,
      ...detail,
    }),
  );
}

/** Remove scratch de um item de processamento (upload bruto + pasta work). */
export async function cleanupProcessamentoItemScratch(itemId: string): Promise<CleanupResult> {
  const removed: string[] = [];
  const skipped: string[] = [];
  const upload = uploadPath(itemId);
  try {
    await fsp.unlink(upload);
    removed.push(`upload:${itemId}.mp3`);
  } catch {
    skipped.push(`upload:${itemId}.mp3`);
  }
  const work = workDir(itemId);
  try {
    await fsp.rm(work, { recursive: true, force: true });
    removed.push(`work:${itemId}`);
  } catch {
    skipped.push(`work:${itemId}`);
  }
  if (removed.length > 0) {
    logCleanup('item_scratch', { itemId, removed });
  }
  return { removed, skipped };
}

/** Remove MP3 em download-staging após cópia para upload (Deemix/Spotizerr/YT). */
export async function cleanupDownloadStagingFile(downloadItemId: string): Promise<boolean> {
  const file = downloadStagingPath(downloadItemId);
  try {
    await fsp.unlink(file);
    logCleanup('download_staging', { downloadItemId });
    return true;
  } catch {
    return false;
  }
}

/** Deemix/YT/Spotizerr: apaga staging não importado ou com erro (sem uso no pipeline). */
export async function cleanupUnusedDownloadStaging(limit = 200): Promise<{
  filesRemoved: number;
  dbUpdated: number;
}> {
  const rows = await portalQuery<{ id: string; status: string }>(
    `SELECT id, status::text AS status
       FROM download_item
      WHERE storage_key LIKE 'download-staging:%'
        AND status NOT IN ('aguardando', 'processando')
        AND (
          status = 'erro'
          OR (status = 'concluido' AND provider_ref LIKE 'import:%')
        )
      ORDER BY updated_at ASC
      LIMIT ${Math.min(500, Math.max(1, limit))}`,
  );

  let filesRemoved = 0;
  let dbUpdated = 0;
  for (const row of rows.rows) {
    if (await cleanupDownloadStagingFile(row.id)) filesRemoved += 1;
    await portalQuery(
      `UPDATE download_item
          SET storage_key = NULL, updated_at = now()
        WHERE id = $1`,
      [row.id],
    );
    dbUpdated += 1;
  }

  const stagingDir = path.join(criacaoConfig.storageRoot, 'download-staging');
  if (fs.existsSync(stagingDir)) {
    const diskFiles = fs
      .readdirSync(stagingDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.mp3'))
      .map((e) => e.name.replace(/\.mp3$/i, ''));
    if (diskFiles.length > 0) {
      const known = await portalQuery<{ id: string }>(
        `SELECT id FROM download_item WHERE id = ANY($1::text[]) AND storage_key LIKE 'download-staging:%'`,
        [diskFiles],
      );
      const keep = new Set(known.rows.map((r) => r.id));
      for (const id of diskFiles) {
        if (keep.has(id)) continue;
        if (await cleanupDownloadStagingFile(id)) filesRemoved += 1;
      }
    }
  }

  if (filesRemoved > 0 || dbUpdated > 0) {
    logCleanup('download_staging_unused', { filesRemoved, dbUpdated });
  }
  return { filesRemoved, dbUpdated };
}

/** Upload scratch sem linha na fila (fantasma). */
async function gcOrphanUploadFiles(limit = 100): Promise<number> {
  const uploadDir = path.join(criacaoConfig.storageRoot, 'upload');
  if (!fs.existsSync(uploadDir)) return 0;
  const diskIds = fs
    .readdirSync(uploadDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mp3'))
    .map((e) => e.name.replace(/\.mp3$/i, ''))
    .slice(0, limit);
  if (diskIds.length === 0) return 0;

  const rows = await portalQuery<{ id: string; status: string }>(
    `SELECT id, status::text AS status FROM processamento_item WHERE id = ANY($1::text[])`,
    [diskIds],
  );
  const byId = new Map(rows.rows.map((r) => [r.id, r.status]));
  let removed = 0;
  for (const id of diskIds) {
    const st = byId.get(id);
    const deletable =
      !st || !['aguardando', 'processando', 'duplicata'].includes(st);
    if (!deletable) continue;
    try {
      await fsp.unlink(uploadPath(id));
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  if (removed > 0) logCleanup('upload_orphan', { removed });
  return removed;
}

/** Staging ligado a um processamento_item via provider_ref import:{itemId}. */
export async function cleanupDownloadStagingForProcessamentoItem(
  processamentoItemId: string,
): Promise<number> {
  const rows = await portalQuery<{ id: string }>(
    `SELECT id FROM download_item
     WHERE provider_ref = $1`,
    [`import:${processamentoItemId}`],
  );
  let n = 0;
  for (const row of rows.rows) {
    if (await cleanupDownloadStagingFile(row.id)) n += 1;
  }
  return n;
}

/** Remove variantes antigas em uso/musicas/{id}/ (ex.: .mp3 após passar a .rib). */
export async function cleanupStaleUsoFiles(musicaId: string, keepBasename: string): Promise<number> {
  const dir = path.join(criacaoConfig.storageRoot, 'uso', 'musicas', musicaId);
  let removed = 0;
  try {
    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      if (name === keepBasename) continue;
      if (!/^mp3_128_mono\.(mp3|rib)$/i.test(name)) continue;
      await fsp.unlink(path.join(dir, name)).catch(() => {});
      removed += 1;
    }
    const left = await fsp.readdir(dir).catch(() => []);
    if (left.length === 0) await fsp.rmdir(dir).catch(() => {});
  } catch {
    /* pasta inexistente */
  }
  if (removed > 0) logCleanup('uso_stale', { musicaId, keepBasename, removed });
  return removed;
}

/** Remove pastas uso/musicas sem versão ativa no Neon. */
async function gcOrphanUsoDirs(limit = 40): Promise<number> {
  const base = path.join(criacaoConfig.storageRoot, 'uso', 'musicas');
  if (!fs.existsSync(base)) return 0;
  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
  let removed = 0;
  for (const d of dirs.slice(0, limit)) {
    const musicaId = d.name;
    const row = await portalQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM musica_versao
       WHERE musica_id = $1 AND storage_key LIKE 'uso:musicas/%'`,
      [musicaId],
    );
    if ((row.rows[0]?.n ?? 0) > 0) continue;
    try {
      await fsp.rm(path.join(base, musicaId), { recursive: true, force: true });
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/** Varredura periódica — só remove scratch/staging já sem uso no pipeline. */
export async function runStorageGarbageCollect(): Promise<{
  uploadRemoved: number;
  workRemoved: number;
  stagingRemoved: number;
  stagingUnusedRemoved: number;
  usoDirsRemoved: number;
}> {
  let uploadRemoved = 0;
  let workRemoved = 0;
  let stagingRemoved = 0;

  uploadRemoved += await gcOrphanUploadFiles(120);

  const erroHours = Math.max(1, Math.floor(criacaoConfig.scratchRetentionErroHours));

  const uploadRows = await portalQuery<{ id: string }>(
    `SELECT id FROM processamento_item
     WHERE raw_storage_key IS NOT NULL
       AND (
         status = 'concluido'
         OR (status = 'erro' AND updated_at < now() - make_interval(hours => $1))
       )
     ORDER BY updated_at ASC
     LIMIT 120`,
    [erroHours],
  );
  for (const row of uploadRows.rows) {
    const r = await cleanupProcessamentoItemScratch(row.id);
    if (r.removed.some((x) => x.startsWith('upload:'))) uploadRemoved += 1;
  }

  const duplicataDescartada = await portalQuery<{ id: string }>(
    `SELECT id FROM processamento_item
     WHERE status = 'concluido'
       AND erro_msg LIKE 'Descartada (duplicata confirmada)%'
       AND raw_storage_key IS NOT NULL
     ORDER BY updated_at ASC
     LIMIT 80`,
  );
  for (const row of duplicataDescartada.rows) {
    const r = await cleanupProcessamentoItemScratch(row.id);
    if (r.removed.some((x) => x.startsWith('upload:'))) uploadRemoved += 1;
  }

  const workBase = path.join(criacaoConfig.storageRoot, 'work');
  if (fs.existsSync(workBase)) {
    const dirs = fs
      .readdirSync(workBase, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (dirs.length > 0) {
      const active = await portalQuery<{ id: string }>(
        `SELECT id FROM processamento_item WHERE status = 'processando' AND id = ANY($1::text[])`,
        [dirs],
      );
      const activeSet = new Set(active.rows.map((r) => r.id));
      for (const dirId of dirs) {
        if (activeSet.has(dirId)) continue;
        if (dirId.startsWith('edicao-') || dirId.startsWith('mixtrim-')) continue;
        try {
          await fsp.rm(path.join(workBase, dirId), { recursive: true, force: true });
          workRemoved += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }

  const stagingRows = await portalQuery<{ id: string }>(
    `SELECT id FROM download_item
     WHERE provider_ref LIKE 'import:%'
       AND status = 'concluido'
     ORDER BY updated_at ASC
     LIMIT 120`,
  );
  for (const row of stagingRows.rows) {
    if (await cleanupDownloadStagingFile(row.id)) stagingRemoved += 1;
  }

  const unusedStaging = await cleanupUnusedDownloadStaging(200);
  const stagingUnusedRemoved = unusedStaging.filesRemoved;

  const usoDirsRemoved = await gcOrphanUsoDirs(30);

  if (uploadRemoved + workRemoved + stagingRemoved + stagingUnusedRemoved + usoDirsRemoved > 0) {
    logCleanup('gc_batch', {
      uploadRemoved,
      workRemoved,
      stagingRemoved,
      stagingUnusedRemoved,
      usoDirsRemoved,
    });
  }

  return { uploadRemoved, workRemoved, stagingRemoved, stagingUnusedRemoved, usoDirsRemoved };
}

/** Após armazenamento definitivo (uso + master): limpa scratch e staging importado. */
export async function cleanupAfterItemPersisted(itemId: string): Promise<CleanupResult> {
  const scratch = await cleanupProcessamentoItemScratch(itemId);
  await cleanupDownloadStagingForProcessamentoItem(itemId);
  return scratch;
}
