import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { uploadMasterToB2 } from './b2.js';
import { criacaoConfig } from './config.js';
import { findDuplicate } from './dedupe.js';
import { analyzeAudio } from './analyze.js';
import { produceMasterAndUso, probeBpmFromFile, probeIsrcFromFile } from './ffmpeg.js';
import { detectMixAndTrim } from './mixTrimDetect.js';
import { parseMp3Filename } from './parseFilename.js';
import { portalQuery } from './portalDb.js';
import { pipelineLog, pipelineTimed } from './pipelineLogger.js';
import { packUsoAudio } from './rib.js';
import { uploadUsoToR2 } from './r2.js';
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

/** Hash idêntico — confirma duplicata; garante mix/128 na faixa existente se faltar. */
async function refreshMixOrProduceOnDuplicate(
  item: ClaimedItem,
  existenteId: string,
  inputPath: string,
): Promise<void> {
  const r = await portalQuery<{ hasUso: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM musica_versao
        WHERE musica_id = $1 AND formato = 'mp3_128_mono'
     ) AS "hasUso"`,
    [existenteId],
  );
  if (!r.rows[0]?.hasUso) {
    await stepProduce(item, existenteId, inputPath);
    await fsp.rm(workDir(item.id), { recursive: true, force: true }).catch(() => {});
    await fsp.unlink(inputPath).catch(() => {});
    return;
  }

  const { mixSegundosFinais, trimFimMs, trimInicioMs } = await detectMixAndTrim(inputPath);
  const mix =
    mixSegundosFinais > 0 ? mixSegundosFinais : criacaoConfig.defaultMixSegundos;
  await portalQuery(
    `UPDATE musica_biblioteca
        SET mix_segundos_finais = $2,
            trim_inicio_ms = $3,
            trim_fim_ms = $4,
            updated_at = now()
      WHERE id = $1
        AND mix_auto = true
        AND (mix_segundos_finais IS NULL OR mix_segundos_finais = 0)`,
    [existenteId, mix, trimInicioMs, trimFimMs],
  );
  pipelineLog(
    { itemId: item.id, jobId: item.job_id, musicaId: existenteId, etapa: 'ponto_mix' },
    'mix_trim_duplicata_atualizado',
    { mixSegundos: mix, trimFimMs, trimInicioMs },
  );
}

/** Hash idêntico — confirma duplicata sem revisão humana; aplica tag na faixa existente. */
async function finishItemDuplicataAutoConfirmada(item: ClaimedItem, existenteId: string): Promise<void> {
  await portalQuery(
    `UPDATE processamento_item
        SET status = 'concluido', duplicata_de_id = $2, musica_id = $2,
            etapa_atual = 'deduplicacao',
            erro_msg = 'Descartada (duplicata confirmada)',
            updated_at = now()
      WHERE id = $1`,
    [item.id, existenteId],
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
  const r = await portalQuery<{
    pending: number;
    erros: number;
    duplicatas: number;
    tipo: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE status IN ('aguardando', 'processando'))::int AS pending,
       count(*) FILTER (WHERE status = 'erro')::int AS erros,
       count(*) FILTER (WHERE status = 'duplicata')::int AS duplicatas,
       (SELECT tipo::text FROM processamento_job WHERE id = $1) AS tipo
       FROM processamento_item
      WHERE job_id = $1`,
    [jobId],
  );
  const row = r.rows[0];
  if ((row?.pending ?? 0) > 0) return;
  const status =
    (row?.erros ?? 0) > 0 ? 'erro'
    : (row?.duplicatas ?? 0) > 0 ? 'revisao'
    : 'concluido';
  await portalQuery(
    `UPDATE processamento_job
        SET status = $2::"JobStatus", etapa_atual = 'armazenamento',
            finished_at = CASE WHEN $2::text IN ('concluido', 'erro') THEN now() ELSE finished_at END,
            updated_at = now()
      WHERE id = $1`,
    [jobId, status],
  );
  if (status === 'concluido' && row?.tipo === 'upload_pasta') {
    await applyPastaUploadsForJob(jobId);
  }
}

/** Coloca faixas processadas na pasta do job — espelha applyPendingPastaUploads do portal. */
async function applyPastaUploadsForJob(jobId: string): Promise<void> {
  const pending = await portalQuery<{
    musicaId: string;
    pastaId: string;
    programacaoId: string;
  }>(
    `SELECT pi.musica_id AS "musicaId",
            j.pasta_id AS "pastaId",
            p.programacao_id AS "programacaoId"
       FROM processamento_item pi
       JOIN processamento_job j ON j.id = pi.job_id
       JOIN pasta p ON p.id = j.pasta_id
      WHERE pi.job_id = $1
        AND pi.status = 'concluido'
        AND pi.musica_id IS NOT NULL
        AND j.pasta_id IS NOT NULL
        AND j.status = 'concluido'
        AND NOT EXISTS (
          SELECT 1 FROM pasta_musica pm
            JOIN pasta pa ON pa.id = pm.pasta_id
           WHERE pa.programacao_id = p.programacao_id
             AND pm.musica_id = pi.musica_id
        )`,
    [jobId],
  );

  for (const row of pending.rows) {
    const last = await portalQuery<{ sortOrder: number | null }>(
      `SELECT sort_order AS "sortOrder"
         FROM pasta_musica
        WHERE pasta_id = $1
        ORDER BY sort_order DESC
        LIMIT 1`,
      [row.pastaId],
    );
    const nextOrder = (last.rows[0]?.sortOrder ?? -1) + 1;
    await portalQuery(
      `INSERT INTO pasta_musica (pasta_id, musica_id, sort_order, added_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (pasta_id, musica_id) DO NOTHING`,
      [row.pastaId, row.musicaId, nextOrder],
    );
  }
}

function resolveInputPath(item: ClaimedItem): string {
  const key = item.raw_storage_key ?? uploadKey(item.id);
  if (key.startsWith('upload:')) {
    return uploadPath(item.id);
  }
  return uploadPath(item.id);
}

async function stepDedupe(item: ClaimedItem, inputPath: string): Promise<string | 'duplicata'> {
  const ctx = { itemId: item.id, jobId: item.job_id, etapa: 'deduplicacao' };
  return pipelineTimed(ctx, async () => {
    await setItemEtapa(item.id, 'deduplicacao');
    const dup = await findDuplicate(inputPath, { skipChromaprintMatchId: item.duplicata_de_id });
    if (dup.kind === 'duplicata') {
      pipelineLog(ctx, 'duplicata', { via: dup.via, existenteId: dup.existenteId });
      if (dup.via === 'content_hash') {
        await refreshMixOrProduceOnDuplicate(item, dup.existenteId, inputPath);
        await finishItemDuplicataAutoConfirmada(item, dup.existenteId);
      } else {
        await finishItemDuplicata(item, dup.existenteId);
      }
      return 'duplicata' as const;
    }

    const { artista, titulo } = parseMp3Filename(item.arquivo_nome);
    const musicaId = crypto.randomUUID();
    const ins = await portalQuery<{ id: string }>(
      `INSERT INTO musica_biblioteca
         (id, titulo, artista, content_hash, chromaprint, status, mix_segundos_finais, mix_auto, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'processando', 0, true, now())
       RETURNING id`,
      [
        musicaId,
        titulo,
        artista,
        dup.contentHash,
        dup.chromaprint,
      ],
    );
    return ins.rows[0]!.id;
  });
}

async function stepProduce(item: ClaimedItem, musicaId: string, inputPath: string): Promise<void> {
  const ctx = { itemId: item.id, jobId: item.job_id, musicaId, etapa: 'producao' };

  await pipelineTimed({ ...ctx, etapa: 'ponto_mix' }, async () => {
    await setItemEtapa(item.id, 'ponto_mix');
    const { mixSegundosFinais: detectedMix, trimFimMs, trimInicioMs } = await detectMixAndTrim(inputPath);
    const mixSegundosFinais =
      detectedMix > 0 ? detectedMix : criacaoConfig.defaultMixSegundos;
    await portalQuery(
      `UPDATE musica_biblioteca
          SET mix_segundos_finais = $2,
              trim_inicio_ms = $3,
              trim_fim_ms = $4,
              updated_at = now()
        WHERE id = $1 AND mix_auto = true`,
      [musicaId, mixSegundosFinais, trimInicioMs, trimFimMs],
    );
    pipelineLog(
      { ...ctx, etapa: 'ponto_mix' },
      'mix_trim_detectado',
      { mixSegundos: mixSegundosFinais, trimFimMs, trimInicioMs },
    );
  });

  const produced = await pipelineTimed({ ...ctx, etapa: 'normalizacao' }, async () => {
    await setItemEtapa(item.id, 'normalizacao');
    ensureStorageDirs();
    const wd = workDir(item.id);
    return produceMasterAndUso(inputPath, wd);
  });

  await pipelineTimed({ ...ctx, etapa: 'armazenamento' }, async () => {
    await setItemEtapa(item.id, 'armazenamento');

    const masterKey = await uploadMasterToB2(musicaId, produced.masterPath);

    const mp3Buf = await fsp.readFile(produced.uso128Path);
    const packed = packUsoAudio(mp3Buf);
    const usoKey = usoStorageKey(musicaId, 'mp3_128_mono', packed.ext);
    const usoRel = usoRelFromStorageKey(usoKey);
    const usoDest = usoPath(usoRel);
    await fsp.mkdir(path.dirname(usoDest), { recursive: true });
    await fsp.writeFile(usoDest, packed.data);

    await uploadUsoToR2(musicaId, usoDest, `mp3_128_mono${packed.ext}`).catch(() => null);

    const [tagBpm, analyzed, tagIsrc] = await Promise.all([
      probeBpmFromFile(produced.uso128Path),
      analyzeAudio(inputPath),
      probeIsrcFromFile(inputPath),
    ]);
    const bpm = tagBpm ?? analyzed.bpm;
    const energia = analyzed.energia;

    await portalQuery(
      `INSERT INTO musica_versao (id, musica_id, formato, storage_key, size_bytes, created_at)
       VALUES ($4, $1, 'mp3_128_mono', $2, $3, now())
       ON CONFLICT (musica_id, formato) DO UPDATE
         SET storage_key = EXCLUDED.storage_key,
             size_bytes = EXCLUDED.size_bytes`,
      [musicaId, usoKey, mp3Buf.length, crypto.randomUUID()],
    );

    await portalQuery(
      `UPDATE musica_biblioteca
          SET status = 'pronta',
              duration_ms = $2,
              master_storage_key = $3,
              master_bitrate = 192,
              loudness_lufs = $4,
              true_peak_db = $5,
              bpm = COALESCE($6, bpm),
              energia = COALESCE($7, energia),
              isrc = COALESCE(isrc, $8),
              updated_at = now()
        WHERE id = $1`,
      [
        musicaId,
        produced.durationMs,
        masterKey,
        criacaoConfig.targetLufs,
        criacaoConfig.targetTruePeak,
        bpm,
        energia,
        tagIsrc,
      ],
    );

    pipelineLog({ ...ctx, etapa: 'armazenamento' }, 'uso_gravado', {
      storageKey: usoKey,
      bytes: packed.data.length,
      encrypted: packed.encrypted,
      bpm,
      energia,
      isrc: tagIsrc,
    });
  });

  await setItemEtapa(item.id, 'tags');
  await pipelineTimed({ ...ctx, etapa: 'tags' }, () => enrichTags(musicaId));
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
      // Mantém o upload bruto para preview na revisão (GET /criacao/upload-audio).
      return;
    }
    musicaId = musicaOrDup;
    await stepProduce(item, musicaId, inputPath);
    await fsp.rm(workDir(item.id), { recursive: true, force: true }).catch(() => {});
    await fsp.unlink(inputPath).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'pipeline_falhou';
    pipelineLog(
      { itemId: item.id, jobId: item.job_id, musicaId: musicaId ?? undefined, etapa: 'erro' },
      msg,
    );
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
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: 'criacao-worker',
      msg: 'iniciado',
      pollMs: criacaoConfig.workerPollMs,
      mixPadraoSeg: criacaoConfig.defaultMixSegundos,
      rib: criacaoConfig.ribSecret.length >= 16,
    }),
  );
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
