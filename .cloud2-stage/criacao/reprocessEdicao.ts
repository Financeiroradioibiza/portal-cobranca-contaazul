import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { downloadMasterToFile } from './b2.js';
import { encodeTrimmedUso128Mono } from './ffmpeg.js';
import { portalQuery } from './portalDb.js';
import { decryptRib, isRibFile, packUsoAudio } from './rib.js';
import {
  ensureStorageDirs,
  masterLocalPath,
  usoPath,
  usoRelFromStorageKey,
  usoStorageKey,
  workDir,
} from './storage.js';

type MusicaRow = {
  trim_inicio_ms: number | null;
  trim_fim_ms: number | null;
  duration_ms: number | null;
  master_storage_key: string | null;
};

const FORMATO_USO = 'mp3_128_mono';

async function resolveSourceMp3(musicaId: string, work: string): Promise<string | null> {
  const masterDest = path.join(work, 'master.mp3');
  if (await downloadMasterToFile(musicaId, masterDest)) return masterDest;

  const localMaster = masterLocalPath(musicaId);
  try {
    await fsp.access(localMaster);
    return localMaster;
  } catch {
    /* tenta versão de uso */
  }

  const ver = await portalQuery<{ storage_key: string }>(
    `SELECT storage_key FROM musica_versao
      WHERE musica_id = $1 AND formato::text = $2
      LIMIT 1`,
    [musicaId, FORMATO_USO],
  );
  const key = ver.rows[0]?.storage_key;
  if (!key) return null;

  const rel = usoRelFromStorageKey(key);
  const filePath = usoPath(rel);
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat) return null;

  const flatDest = path.join(work, 'source.mp3');
  if (isRibFile(rel)) {
    const rib = await fsp.readFile(filePath);
    const mp3 = decryptRib(rib);
    await fsp.writeFile(flatDest, mp3);
    return flatDest;
  }

  await fsp.copyFile(filePath, flatDest);
  return flatDest;
}

/** Re-renderiza a versão de uso após trim na edição de música. */
export async function reprocessMusicaEdicao(musicaId: string): Promise<{ durationMs: number; bytes: number }> {
  const row = await portalQuery<MusicaRow>(
    `SELECT trim_inicio_ms, trim_fim_ms, duration_ms, master_storage_key
       FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) throw new Error('musica_nao_encontrada');

  ensureStorageDirs();
  const work = workDir(`edicao-${musicaId}`);
  await fsp.mkdir(work, { recursive: true });

  const source = await resolveSourceMp3(musicaId, work);
  if (!source) throw new Error('fonte_ausente');

  const trimIni = Math.max(0, m.trim_inicio_ms ?? 0);
  const trimFim = Math.max(0, m.trim_fim_ms ?? 0);
  const outMp3 = path.join(work, 'uso_trim.mp3');
  const { durationMs } = await encodeTrimmedUso128Mono(source, outMp3, trimIni, trimFim);

  const mp3Buf = await fsp.readFile(outMp3);
  const packed = packUsoAudio(mp3Buf);
  const usoKey = usoStorageKey(musicaId, FORMATO_USO, packed.ext);
  const usoDest = usoPath(usoRelFromStorageKey(usoKey));
  await fsp.mkdir(path.dirname(usoDest), { recursive: true });
  await fsp.writeFile(usoDest, packed.data);

  await portalQuery(
    `INSERT INTO musica_versao (id, musica_id, formato, storage_key, size_bytes, created_at)
     VALUES ($4, $1, $2, $3, $5, now())
     ON CONFLICT (musica_id, formato) DO UPDATE
       SET storage_key = EXCLUDED.storage_key,
           size_bytes = EXCLUDED.size_bytes`,
    [musicaId, FORMATO_USO, usoKey, crypto.randomUUID(), packed.data.length],
  );

  await portalQuery(
    `UPDATE musica_biblioteca SET duration_ms = $2, updated_at = now() WHERE id = $1`,
    [musicaId, durationMs],
  );

  await fsp.rm(work, { recursive: true, force: true }).catch(() => null);

  return { durationMs, bytes: packed.data.length };
}
