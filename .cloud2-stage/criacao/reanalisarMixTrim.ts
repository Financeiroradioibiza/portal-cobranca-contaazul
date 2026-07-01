import fsp from 'node:fs/promises';
import { persistMixTrimForMusica, resolveMixTrim } from './mixTrimApply.js';
import { reprocessMusicaEdicao } from './reprocessEdicao.js';
import { portalQuery } from './portalDb.js';
import { uploadPath } from './storage.js';

export type ReanalisarMixTrimResult = {
  musicaId: string;
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

/** Reanalisa mix/trim a partir do MP3 bruto do upload (se ainda existir no disco). */
export async function reanalisarMixTrimForMusica(musicaId: string): Promise<ReanalisarMixTrimResult> {
  const id = musicaId.trim();
  if (!id) return { musicaId: id, ok: false, error: 'id_invalido' };

  const inputPath = await findUploadPath(id);
  if (!inputPath) return { musicaId: id, ok: false, error: 'upload_ausente' };

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
