import fs from 'node:fs';
import path from 'node:path';
import { criacaoConfig } from './config.js';
import { portalQuery } from './portalDb.js';
import { uploadKey } from './storage.js';

export type OrphanBucketReport = {
  name: string;
  path: string;
  fileCount: number;
  orphanCount: number;
  orphanBytesEstimate: number | null;
  /** Amostra de ids/nomes — no máximo 8 entradas. */
  samples: string[];
  note: string;
};

function listMp3Files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.mp3'))
    .map((e) => e.name);
}

function listSubdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

async function fileSizeBytes(full: string): Promise<number | null> {
  try {
    const st = await fs.promises.stat(full);
    return st.size;
  } catch {
    return null;
  }
}

/** Inventário read-only de arquivos provavelmente órfãos (não apaga nada). */
export async function collectOrphanStorageReport(): Promise<{
  ok: true;
  collectedAt: string;
  storageRoot: string;
  buckets: OrphanBucketReport[];
  warnings: string[];
}> {
  const root = criacaoConfig.storageRoot;
  const warnings: string[] = [];
  const buckets: OrphanBucketReport[] = [];

  // --- upload/ ---
  const uploadDir = path.join(root, 'upload');
  const uploadFiles = listMp3Files(uploadDir);
  const uploadIds = uploadFiles.map((f) => f.replace(/\.mp3$/i, ''));
  let uploadOrphans: string[] = [];
  if (uploadIds.length > 0) {
    const rows = await portalQuery<{ id: string; status: string }>(
      `SELECT id, status::text AS status FROM processamento_item WHERE id = ANY($1::text[])`,
      [uploadIds],
    );
    const byId = new Map(rows.rows.map((r) => [r.id, r.status]));
    uploadOrphans = uploadIds.filter((id) => {
      const st = byId.get(id);
      if (!st) return true;
      return !['aguardando', 'processando', 'duplicata'].includes(st);
    });
  }
  let uploadOrphanBytes = 0;
  for (const id of uploadOrphans.slice(0, 200)) {
    const sz = await fileSizeBytes(path.join(uploadDir, `${id}.mp3`));
    if (sz) uploadOrphanBytes += sz;
  }
  buckets.push({
    name: 'upload',
    path: uploadDir,
    fileCount: uploadFiles.length,
    orphanCount: uploadOrphans.length,
    orphanBytesEstimate: uploadOrphans.length > 0 ? uploadOrphanBytes : 0,
    samples: uploadOrphans.slice(0, 8).map((id) => `${id}.mp3`),
    note: 'Scratch pós-ingest. Órfão = sem item na fila ou status já terminal (concluido/erro/cancelado). Duplicata em revisão mantém arquivo de propósito.',
  });

  // --- download-staging/ ---
  const stagingDir = path.join(root, 'download-staging');
  const stagingFiles = listMp3Files(stagingDir);
  const stagingIds = stagingFiles.map((f) => f.replace(/\.mp3$/i, ''));
  let stagingOrphans: string[] = stagingIds;
  if (stagingIds.length > 0) {
    const rows = await portalQuery<{ id: string }>(
      `SELECT id FROM download_item WHERE id = ANY($1::text[])`,
      [stagingIds],
    );
    const known = new Set(rows.rows.map((r) => r.id));
    stagingOrphans = stagingIds.filter((id) => !known.has(id));
  }
  buckets.push({
    name: 'download-staging',
    path: stagingDir,
    fileCount: stagingFiles.length,
    orphanCount: stagingOrphans.length,
    orphanBytesEstimate: null,
    samples: stagingOrphans.slice(0, 8).map((id) => `${id}.mp3`),
    note: 'MP3 baixados (Deemix/Spotizerr/YT). ingest-from-staging copia sem apagar — acumula mesmo após import.',
  });

  // --- work/ ---
  const workDir = path.join(root, 'work');
  const workDirs = listSubdirs(workDir);
  let workOrphans: string[] = [];
  if (workDirs.length > 0) {
    const rows = await portalQuery<{ id: string; status: string }>(
      `SELECT id, status::text AS status FROM processamento_item WHERE id = ANY($1::text[])`,
      [workDirs],
    );
    const byId = new Map(rows.rows.map((r) => [r.id, r.status]));
    workOrphans = workDirs.filter((id) => {
      const st = byId.get(id);
      if (!st) return true;
      return !['processando'].includes(st);
    });
  }
  buckets.push({
    name: 'work',
    path: workDir,
    fileCount: workDirs.length,
    orphanCount: workOrphans.length,
    orphanBytesEstimate: null,
    samples: workOrphans.slice(0, 8),
    note: 'Intermediários ffmpeg. Órfão = pasta sem item processando (crash/erro no pipeline).',
  });

  // --- uso/musicas/ ---
  const usoMusicasDir = path.join(root, 'uso', 'musicas');
  const usoDirs = listSubdirs(usoMusicasDir);
  const usoRows = await portalQuery<{ musica_id: string }>(
    `SELECT DISTINCT musica_id FROM musica_versao WHERE storage_key LIKE 'uso:musicas/%'`,
  );
  const usoKnown = new Set(usoRows.rows.map((r) => r.musica_id));
  const usoOrphans = usoDirs.filter((id) => !usoKnown.has(id));
  buckets.push({
    name: 'uso/musicas',
    path: usoMusicasDir,
    fileCount: usoDirs.length,
    orphanCount: usoOrphans.length,
    orphanBytesEstimate: null,
    samples: usoOrphans.slice(0, 8),
    note: 'Hot copy player/preview. Órfão = pasta sem musica_versao ativa (ex.: faixa apagada no portal ou reprocess trocou extensão).',
  });

  // --- master-local/ ---
  const masterDir = path.join(root, 'master-local');
  const masterFiles = listMp3Files(masterDir);
  const masterIds = masterFiles.map((f) => f.replace(/\.mp3$/i, ''));
  let masterOrphans: string[] = masterIds;
  if (masterIds.length > 0) {
    const rows = await portalQuery<{ id: string }>(
      `SELECT id FROM musica_biblioteca
       WHERE id = ANY($1::text[])
         AND (master_storage_key LIKE 'local:%' OR master_storage_key IS NULL)`,
      [masterIds],
    );
    const known = new Set(rows.rows.map((r) => r.id));
    masterOrphans = masterIds.filter((id) => !known.has(id));
  }
  buckets.push({
    name: 'master-local',
    path: masterDir,
    fileCount: masterFiles.length,
    orphanCount: masterOrphans.length,
    orphanBytesEstimate: null,
    samples: masterOrphans.slice(0, 8).map((id) => `${id}.mp3`),
    note: 'Fallback quando B2 desligado. Órfão = MP3 sem linha na biblioteca.',
  });

  // Referências úteis para upload ainda «ativos»
  const activeUploadItems = await portalQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM processamento_item
     WHERE status IN ('aguardando', 'processando', 'duplicata')
       AND raw_storage_key LIKE 'upload:%'`,
  );
  if (uploadFiles.length > (activeUploadItems.rows[0]?.n ?? 0) + 5) {
    warnings.push(
      `upload/: ${uploadFiles.length} arquivos vs ${activeUploadItems.rows[0]?.n ?? 0} itens ativos na fila — revisar limpeza futura.`,
    );
  }

  if (stagingFiles.length > 20) {
    warnings.push(
      `download-staging/: ${stagingFiles.length} MP3 — import copia sem remover origem; principal candidato a crescimento contínuo.`,
    );
  }

  warnings.push(
    'B2 masters gravados como masters/{id}.mp3 (sem prefixo b2:) — DELETE biblioteca pode não remover objeto remoto.',
  );
  warnings.push('R2 uso: uploadUsoToR2() sem delete correspondente — objetos acumulam se R2 habilitado.');

  return {
    ok: true,
    collectedAt: new Date().toISOString(),
    storageRoot: root,
    buckets,
    warnings,
  };
}

/** IDs de upload referenciados na fila (debug). */
export function expectedUploadKey(itemId: string): string {
  return uploadKey(itemId);
}
