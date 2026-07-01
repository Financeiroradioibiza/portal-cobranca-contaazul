import fsp from 'node:fs/promises';
import { persistMixTrimForMusica, resolveMixTrim } from './mixTrimApply.js';
import { findMusicaSourceMp3, reprocessMusicaEdicao } from './reprocessEdicao.js';
import { portalQuery } from './portalDb.js';
import { ensureStorageDirs, uploadPath, workDir } from './storage.js';

export type ReanalisarMixTrimResult = {
  musicaId: string;
  titulo?: string;
  artista?: string;
  ok: boolean;
  error?: string;
  mixSegundos?: number;
  trimFimMs?: number;
  quietOutro?: boolean;
};

async function findUploadPath(musicaId: string): Promise<string | null> {
  const item = await portalQuery<{ item_id: string }>(
    `SELECT pi.id AS item_id
       FROM processamento_item pi
      WHERE pi.musica_id = $1
        AND pi.status = 'concluido'
      ORDER BY pi.updated_at DESC
      LIMIT 1`,
    [musicaId],
  );
  const itemId = item.rows[0]?.item_id;
  if (!itemId) return null;
  const inputPath = uploadPath(itemId);
  try {
    await fsp.access(inputPath);
    return inputPath;
  } catch {
    return null;
  }
}

/** Reanalisa mix/trim a partir do áudio disponível no disco/B2. */
export async function reanalisarMixTrimForMusica(musicaId: string): Promise<ReanalisarMixTrimResult> {
  const id = musicaId.trim();
  if (!id) return { musicaId: id, ok: false, error: 'id_invalido' };

  let inputPath = await findUploadPath(id);
  let scratchWork: string | null = null;

  if (!inputPath) {
    ensureStorageDirs();
    scratchWork = workDir(`mixtrim-${id.slice(0, 8)}`);
    await fsp.mkdir(scratchWork, { recursive: true });
    inputPath = await findMusicaSourceMp3(id, scratchWork);
  }

  if (!inputPath) {
    if (scratchWork) await fsp.rm(scratchWork, { recursive: true, force: true }).catch(() => null);
    return { musicaId: id, ok: false, error: 'audio_ausente' };
  }

  try {
    const resolved = await resolveMixTrim(inputPath);
    await persistMixTrimForMusica(id, resolved, false);
    if (resolved.trimFimMs > 0) {
      try {
        await reprocessMusicaEdicao(id);
      } catch {
        /* metadata ok; reprocess pode falhar se master ausente */
      }
    }
    return {
      musicaId: id,
      ok: true,
      mixSegundos: resolved.appliedMixSegundos,
      trimFimMs: resolved.trimFimMs,
      quietOutro: resolved.quietOutro,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { musicaId: id, ok: false, error: detail || 'falha_analise' };
  } finally {
    if (scratchWork) await fsp.rm(scratchWork, { recursive: true, force: true }).catch(() => null);
  }
}

export async function reanalisarMixTrimBulk(musicaIds: string[]): Promise<ReanalisarMixTrimResult[]> {
  const unique = [...new Set(musicaIds.map((id) => id.trim()).filter(Boolean))].slice(0, 80);
  const results: ReanalisarMixTrimResult[] = [];
  for (const id of unique) {
    results.push(await reanalisarMixTrimForMusica(id));
  }
  return results;
}

/** Reanalisa faixas prontas com mix_auto e mix=0 (útil pós-deploy do algoritmo). */
export async function reanalisarMixTrimAutoZeroBulk(limit = 100): Promise<ReanalisarMixTrimResult[]> {
  const cap = Math.min(500, Math.max(1, limit));
  const rows = await portalQuery<{ id: string; titulo: string; artista: string }>(
    `SELECT id, titulo, artista
       FROM musica_biblioteca
      WHERE status = 'pronta'
        AND mix_auto = true
        AND COALESCE(mix_segundos_finais, 0) = 0
      ORDER BY updated_at DESC
      LIMIT $1`,
    [cap],
  );

  const results: ReanalisarMixTrimResult[] = [];
  for (const m of rows.rows) {
    const r = await reanalisarMixTrimForMusica(m.id);
    results.push({ ...r, titulo: m.titulo, artista: m.artista });
  }
  return results;
}
