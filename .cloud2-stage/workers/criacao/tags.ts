import { portalQuery } from '../../criacao/portalDb.js';
import {
  extractGravadoraFromTags,
  fetchDeezerExplicit,
  fetchLabelTags,
  fetchMusicBrainzExplicit,
  hasApiExplicitCheck,
  mergeApiExplicitTags,
  mergeExternalTags,
  parseTagsFromJson,
  type ExternalAutoTag,
} from '../../routes/criacao/tagEnrichmentCore.js';

/**
 * Metadados pós-upload: gravadora + explicit Deezer/MB em tags_auto.
 * Chamado ao final do pipeline e pelo poll do worker.
 */
export async function enrichUploadTagsForMusica(musicaId: string): Promise<void> {
  const row = await portalQuery<{
    titulo: string;
    artista: string;
    isrc: string | null;
    tags_auto: unknown;
  }>(
    `SELECT titulo, artista, isrc, tags_auto FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) return;

  let merged = parseTagsFromJson(m.tags_auto);
  let changed = false;

  if (!extractGravadoraFromTags(merged)) {
    const labels = await fetchLabelTags({
      titulo: m.titulo,
      artista: m.artista,
      isrc: m.isrc,
    });
    if (labels.length > 0) {
      merged = mergeExternalTags(merged, labels);
      changed = true;
    }
  }

  if (!hasApiExplicitCheck(merged)) {
    const deezer = await fetchDeezerExplicit({ titulo: m.titulo, artista: m.artista });
    const musicbrainz = await fetchMusicBrainzExplicit({
      titulo: m.titulo,
      artista: m.artista,
      isrc: m.isrc,
    });
    merged = mergeApiExplicitTags(merged, { deezer, musicbrainz });
    changed = true;
  }

  if (!changed) return;

  await portalQuery(
    `UPDATE musica_biblioteca SET tags_auto = $2::jsonb, updated_at = now() WHERE id = $1`,
    [musicaId, JSON.stringify(merged)],
  );
}

/** Reconsulta gravadora + explicit Deezer/MB (ignora tags já preenchidas). */
export async function refreshInternetTagsForMusica(musicaId: string): Promise<{ updated: boolean; gravadora: string }> {
  const row = await portalQuery<{
    titulo: string;
    artista: string;
    isrc: string | null;
    tags_auto: unknown;
  }>(
    `SELECT titulo, artista, isrc, tags_auto FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) throw new Error('not_found');

  const before = JSON.stringify(parseTagsFromJson(m.tags_auto));
  let merged = parseTagsFromJson(m.tags_auto);

  const labels = await fetchLabelTags({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });
  if (labels.length > 0) merged = mergeExternalTags(merged, labels);

  const deezer = await fetchDeezerExplicit({ titulo: m.titulo, artista: m.artista });
  const musicbrainz = await fetchMusicBrainzExplicit({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });
  merged = mergeApiExplicitTags(merged, { deezer, musicbrainz });

  const after = JSON.stringify(merged);
  if (before === after) {
    return { updated: false, gravadora: extractGravadoraFromTags(merged) };
  }

  await portalQuery(
    `UPDATE musica_biblioteca SET tags_auto = $2::jsonb, updated_at = now() WHERE id = $1`,
    [musicaId, JSON.stringify(merged)],
  );
  return { updated: true, gravadora: extractGravadoraFromTags(merged) };
}

/** Chamado pelo pipeline pós-upload (workers/criacao/pipeline.ts). */
export async function enrichTags(
  musicaId: string,
  _meta?: { artista?: string; titulo?: string; isrc?: string | null },
): Promise<void> {
  await enrichUploadTagsForMusica(musicaId);
}

/** @deprecated alias */
export async function enrichLabelsForMusica(musicaId: string): Promise<ExternalAutoTag[]> {
  await enrichUploadTagsForMusica(musicaId);
  return [];
}

export async function enrichMusicaLabelsById(
  musicaId: string,
): Promise<{ updated: boolean; gravadora: string }> {
  const row = await portalQuery<{
    id: string;
    titulo: string;
    artista: string;
    isrc: string | null;
    tags_auto: unknown;
  }>(
    `SELECT id, titulo, artista, isrc, tags_auto
       FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) throw new Error('not_found');

  const before = extractGravadoraFromTags(parseTagsFromJson(m.tags_auto));
  await enrichUploadTagsForMusica(musicaId);
  const afterRow = await portalQuery<{ tags_auto: unknown }>(
    `SELECT tags_auto FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const after = extractGravadoraFromTags(parseTagsFromJson(afterRow.rows[0]?.tags_auto));
  return { updated: after !== before, gravadora: after };
}
