import { portalQuery } from '../../criacao/portalDb.js';
import {
  extractGravadoraFromTags,
  fetchLabelTags,
  mergeExternalTags,
  parseTagsFromJson,
  type ExternalAutoTag,
} from '../../tagEnrichmentCore.js';

/**
 * Enriquece tags_auto com gravadora (MusicBrainz → Deezer).
 * Chamar ao final do pipeline de ingestão, após gravar titulo/artista/isrc.
 */
export async function enrichLabelsForMusica(musicaId: string): Promise<ExternalAutoTag[]> {
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
  if (!m) return [];

  const existing = parseTagsFromJson(m.tags_auto);
  if (extractGravadoraFromTags(existing)) return [];

  const additions = await fetchLabelTags({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });
  if (additions.length === 0) return [];

  const merged = mergeExternalTags(existing, additions);
  await portalQuery(
    `UPDATE musica_biblioteca SET tags_auto = $2::jsonb, updated_at = now() WHERE id = $1`,
    [musicaId, JSON.stringify(merged)],
  );
  return additions;
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

  const existing = parseTagsFromJson(m.tags_auto);
  const before = extractGravadoraFromTags(existing);
  const additions = await fetchLabelTags({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });
  if (additions.length === 0) {
    return { updated: false, gravadora: before };
  }

  const merged = mergeExternalTags(existing, additions);
  const after = extractGravadoraFromTags(merged);
  if (after === before && before !== '') {
    return { updated: false, gravadora: after };
  }

  await portalQuery(
    `UPDATE musica_biblioteca SET tags_auto = $2::jsonb, updated_at = now() WHERE id = $1`,
    [m.id, JSON.stringify(merged)],
  );
  return { updated: true, gravadora: after };
}
