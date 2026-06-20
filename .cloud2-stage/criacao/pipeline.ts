import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { uploadMasterToB2 } from './b2.js';
import { criacaoConfig } from './config.js';
import { produceMasterAndUso } from './ffmpeg.js';
import { sha256File } from './hash.js';
import { parseMp3Filename } from './parseFilename.js';
import { portalQuery } from './portalDb.js';
import {
  ensureStorageDirs,
  uploadKey,
  uploadPath,
  usoPath,
  usoRelFromStorageKey,
  usoStorageKey,
  workDir,
} from './storage.js';
import { enrichTags } from '../workers/criacao/tags.js';

export type ClaimedItem = {
  id: string;
  job_id: string;
  arquivo_nome: string;
  raw_storage_key: string | null;
  musica_id: string | null;
  duplicata_de_id: string | null;
};

const ETAPAS = ['deduplicacao', 'ponto_mix', 'normalizacao', 'tags', 'armazenamento'] as const;

export async function claimNextItem(): Promise<ClaimedItem | null> {
  const r = await portalQuery<ClaimedItem>(
    `UPDATE processamento_item
        SET status = 'processando', updated_at = now()
      WHERE id = (
        SELECT id FROM processamento_item
         WHERE status = 'aguardando'
           AND raw_storage_key IS NOT NULL
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, job_id, arquivo_nome, raw_storage_key, musica_id, duplicata_de_id`,
  );
  return r.rows[0] ?? null;
}

async function setItemEtapa(itemId: string, etapa: string): Promise<void> {
  await portalQuery(
    `UPDATE processamento_item SET etapa_atual = $2, updated_at = now() WHERE id = $1`,
    [itemId, etapa],
  );
  await portalQuery(
    `UPDATE processamento_job j
        SET etapa_atual = $2, status = 'processando',
            started_at = COALESCE(started_at, now()), updated_at = now()
      FROM processamento_item i
     WHERE i.job_id = j.id AND i.id = $1`,
    [itemId, etapa],
  );
}

async function finishItemOk(item: ClaimedItem, musicaId: string): Promise<void> {
  await portalQuery(
    `UPDATE processamento_item
        SET status = 'concluido', musica_id = $2, etapa_atual = 'armazenamento',
            erro_msg = '', updated_at = now()
      WHERE id = $1`,
    [item.id, musicaId],
  );
  await portalQuery(
    `UPDATE processamento_job j
        SET itens_feitos = (
              SELECT count(*)::int FROM processamento_item
               WHERE job_id = j.id AND status = 'concluido'
            ),
            updated_at = now()
      WHERE j.id = $1`,
    [item.job_id],
  );
  await maybeFinishJob(item.job_id);
}

async function finishItemDuplicata(item: ClaimedItem, existenteId: string): Promise<void> {
  await portalQuery(
    `UPDATE processamento_item
        SET status = 'duplicata', duplicata_de_id = $2, musica_id = $2,
            etapa_atual = 'deduplicacao', erro_msg = '', updated_at = now()
      WHERE id = $1`,
    [item.id, existenteId],
  );
  await portalQuery(
    `UPDATE processamento_job j
        SET itens_feitos = (
              SELECT count(*)::int FROM processamento_item
               WHERE job_id = j.id AND status IN ('concluido', 'duplicata')
            ),
            updated_at = now()
      WHERE j.id = $1`,
    [item.job_id],
  );
  await maybeFinishJob(item.job_id);
}

async function finishItemErro(item: ClaimedItem, msg: string): Promise<void> {
  await portalQuery(
    `UPDATE processamento_item
        SET status = 'erro', erro_msg = $2, updated_at = now()
      WHERE id = $1`,
    [item.id, msg.slice(0, 2000)],
  );
  await portalQuery(
    `UPDATE processamento_job j
        SET status = CASE
              WHEN (SELECT count(*) FROM processamento_item WHERE job_id = j.id AND status = 'erro') > 0
              THEN 'erro'
              ELSE j.status
            END,
            erro_msg = $2,
            updated_at = now()
      WHERE j.id = $1`,
    [item.job_id, msg.slice(0, 2000)],
  );
  await maybeFinishJob(item.job_id);
}

async function maybeFinishJob(jobId: string): Promise<void> {
  const r = await portalQuery<{ pending: number; erros: number }>(
    `SELECT
       count(*) FILTER (WHERE status IN ('aguardando', 'processando'))::int AS pending,
       count(*) FILTER (WHERE status = 'erro')::int AS erros
       FROM processamento_item
      WHERE job_id = $1`,
    [jobId],
  );
  const row = r.rows[0];
  if ((row?.pending ?? 0) > 0) return;
  const status = (row?.erros ?? 0) > 0 ? 'erro' : 'concluido';
  await portalQuery(
    `UPDATE processamento_job
        SET status = $2::"JobStatus", etapa_atual = 'armazenamento',
            finished_at = now(), updated_at = now()
      WHERE id = $1`,
    [jobId, status],
  );
}

function resolveInputPath(item: ClaimedItem): string {
  const key = item.raw_storage_key ?? uploadKey(item.id);
  if (key.startsWith('upload:')) {
    return uploadPath(item.id);
  }
  return uploadPath(item.id);
}

async function stepDedupe(item: ClaimedItem, inputPath: string): Promise<string | 'duplicata'> {
  await setItemEtapa(item.id, 'deduplicacao');
  const contentHash = await sha256File(inputPath);

  const existing = await portalQuery<{ id: string }>(
    `SELECT id FROM musica_biblioteca WHERE content_hash = $1 LIMIT 1`,
    [contentHash],
  );
  if (existing.rowCount && existing.rows[0]?.id) {
    await finishItemDuplicata(item, existing.rows[0].id);
    return 'duplicata';
  }

  const { artista, titulo } = parseMp3Filename(item.arquivo_nome);
  const ins = await portalQuery<{ id: string }>(
    `INSERT INTO musica_biblioteca
       (titulo, artista, content_hash, status, mix_segundos_finais, mix_auto)
     VALUES ($1, $2, $3, 'processando', $4, true)
     RETURNING id`,
    [titulo, artista, contentHash, criacaoConfig.defaultMixSegundos],
  );
  return ins.rows[0]!.id;
}

async function stepProduce(item: ClaimedItem, musicaId: string, inputPath: string): Promise<void> {
  await setItemEtapa(item.id, 'ponto_mix');
  await setItemEtapa(item.id, 'normalizacao');

  ensureStorageDirs();
  const wd = workDir(item.id);
  const produced = await produceMasterAndUso(inputPath, wd);

  await setItemEtapa(item.id, 'armazenamento');

  const masterKey = await uploadMasterToB2(musicaId, produced.masterPath);

  const usoKey = usoStorageKey(musicaId, 'mp3_128_mono');
  const usoRel = usoRelFromStorageKey(usoKey);
  const usoDest = usoPath(usoRel);
  await fsp.mkdir(path.dirname(usoDest), { recursive: true });
  await fsp.copyFile(produced.uso128Path, usoDest);

  await portalQuery(
    `INSERT INTO musica_versao (id, musica_id, formato, storage_key, size_bytes, created_at)
     VALUES ($4, $1, 'mp3_128_mono', $2, $3, now())
     ON CONFLICT (musica_id, formato) DO UPDATE
       SET storage_key = EXCLUDED.storage_key,
           size_bytes = EXCLUDED.size_bytes`,
    [musicaId, usoKey, produced.usoSizeBytes, crypto.randomUUID()],
  );

  await portalQuery(
    `UPDATE musica_biblioteca
        SET status = 'pronta',
            duration_ms = $2,
            master_storage_key = $3,
            master_bitrate = 192,
            loudness_lufs = $4,
            true_peak_db = $5,
            updated_at = now()
      WHERE id = $1`,
    [
      musicaId,
      produced.durationMs,
      masterKey,
      criacaoConfig.targetLufs,
      criacaoConfig.targetTruePeak,
    ],
  );

  await setItemEtapa(item.id, 'tags');
  await enrichTags(musicaId);
  await finishItemOk(item, musicaId);
}

/** Processa um item claimado do início ao fim. */
export async function processClaimedItem(item: ClaimedItem): Promise<void> {
  const inputPath = resolveInputPath(item);
  try {
    await fsp.access(inputPath);
  } catch {
    await finishItemErro(item, 'arquivo_upload_ausente');
    return;
  }

  let musicaId: string | null = null;
  try {
    const musicaOrDup = await stepDedupe(item, inputPath);
    if (musicaOrDup === 'duplicata') {
      await fsp.unlink(inputPath).catch(() => {});
      return;
    }
    musicaId = musicaOrDup;
    await stepProduce(item, musicaId, inputPath);
    await fsp.rm(workDir(item.id), { recursive: true, force: true }).catch(() => {});
    await fsp.unlink(inputPath).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'pipeline_falhou';
    console.error('[pipeline]', item.id, msg);
    if (musicaId) {
      await portalQuery(
        `UPDATE musica_biblioteca SET status = 'erro', updated_at = now() WHERE id = $1`,
        [musicaId],
      ).catch(() => {});
    }
    await finishItemErro(item, msg);
  }
}

export async function runPipelineOnce(): Promise<boolean> {
  ensureStorageDirs();
  const item = await claimNextItem();
  if (!item) return false;
  await processClaimedItem(item);
  return true;
}

export async function runPipelineLoop(): Promise<void> {
  console.log('[criacao-worker] iniciado — poll', criacaoConfig.workerPollMs, 'ms');
  ensureStorageDirs();
  for (;;) {
    try {
      const did = await runPipelineOnce();
      if (!did) {
        await new Promise((r) => setTimeout(r, criacaoConfig.workerPollMs));
      }
    } catch (e) {
      console.error('[criacao-worker] erro no loop:', e);
      await new Promise((r) => setTimeout(r, criacaoConfig.workerPollMs));
    }
  }
}

export { ETAPAS };
