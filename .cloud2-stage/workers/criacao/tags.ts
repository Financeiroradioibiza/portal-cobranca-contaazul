import { portalQuery } from '../../criacao/portalDb.js';
import {
  extractGravadoraFromTags,
  fetchDeezerExplicit,
  fetchExternalTrackMetadata,
  fetchLabelTags,
  fetchMusicBrainzExplicit,
  hasApiExplicitCheck,
  isEligibleForExternalTrackMatch,
  mergeApiExplicitTags,
  mergeExternalTags,
  parseTagsFromJson,
  type ExternalAutoTag,
} from '../../tagEnrichmentCore.js';
import { classifyExplicitLyricsWithGemini } from '../../criacao/explicitGemini.js';

const EXPLICIT_TAG_FONTE = 'moderacao';
const EXPLICIT_TAG_CHAVE = 'explicit';
const EXPLICIT_TAG_VALOR = 'EXP';
const EXPLICIT_CHECKED_VALOR = 'OK';

function hasGeminiExplicitCheck(tags: ExternalAutoTag[]): boolean {
  return tags.some((t) => t.fonte === 'gemini' && t.chave === EXPLICIT_TAG_CHAVE);
}

function mergeGeminiExplicitCheck(
  tags: ExternalAutoTag[],
  geminiTag: 'sim' | 'nao' | 'desconhecida',
): ExternalAutoTag[] {
  const out = tags.filter(
    (t) =>
      !(
        (t.fonte === 'gemini' && t.chave === EXPLICIT_TAG_CHAVE) ||
        (t.fonte === EXPLICIT_TAG_FONTE && t.chave === EXPLICIT_TAG_CHAVE)
      ),
  );
  out.push({ fonte: 'gemini', chave: EXPLICIT_TAG_CHAVE, valor: geminiTag });
  out.push({
    fonte: EXPLICIT_TAG_FONTE,
    chave: EXPLICIT_TAG_CHAVE,
    valor: geminiTag === 'sim' ? EXPLICIT_TAG_VALOR : EXPLICIT_CHECKED_VALOR,
  });
  return out;
}

async function applyMetadataEnrichment(
  m: {
    titulo: string;
    artista: string;
    isrc: string | null;
    bpm: number | null;
    tags_auto: unknown;
  },
  force = false,
): Promise<{ merged: ExternalAutoTag[]; bpm: number | null; isrc: string | null; ano: number | null; changed: boolean }> {
  let merged = parseTagsFromJson(m.tags_auto);
  let changed = false;
  let bpm = m.bpm;
  let isrc = m.isrc;
  let ano: number | null = null;

  if ((force || !isrc?.trim() || bpm == null) && isEligibleForExternalTrackMatch({ titulo: m.titulo, artista: m.artista })) {
    const meta = await fetchExternalTrackMetadata({
      titulo: m.titulo,
      artista: m.artista,
      isrc: m.isrc,
    });
    if (meta.tags.length > 0) {
      merged = mergeExternalTags(merged, meta.tags);
      changed = true;
    }
    if (meta.bpm != null && bpm == null) {
      bpm = meta.bpm;
      changed = true;
    }
    if (meta.isrc && !isrc?.trim()) {
      isrc = meta.isrc;
      changed = true;
    }
    if (meta.ano) ano = meta.ano;
  }

  return { merged, bpm, isrc, ano, changed };
}

/**
 * Metadados pós-upload: ISRC/BPM (Deezer/MB), gravadora + explicit Deezer/MB em tags_auto.
 * Chamado ao final do pipeline e pelo poll do worker.
 */
export async function enrichUploadTagsForMusica(musicaId: string): Promise<void> {
  const row = await portalQuery<{
    titulo: string;
    artista: string;
    isrc: string | null;
    bpm: number | null;
    tags_auto: unknown;
  }>(
    `SELECT titulo, artista, isrc, bpm, tags_auto FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) return;

  const meta = await applyMetadataEnrichment(m);
  let merged = meta.merged;
  let changed = meta.changed;
  let bpm = meta.bpm;
  let isrc = meta.isrc;
  const ano = meta.ano;

  if (!extractGravadoraFromTags(merged) && isEligibleForExternalTrackMatch({ titulo: m.titulo, artista: m.artista })) {
    const labels = await fetchLabelTags({
      titulo: m.titulo,
      artista: m.artista,
      isrc,
    });
    if (labels.length > 0) {
      merged = mergeExternalTags(merged, labels);
      changed = true;
    }
  }

  if (!hasApiExplicitCheck(merged) && isEligibleForExternalTrackMatch({ titulo: m.titulo, artista: m.artista })) {
    const deezer = await fetchDeezerExplicit({ titulo: m.titulo, artista: m.artista });
    const musicbrainz = await fetchMusicBrainzExplicit({
      titulo: m.titulo,
      artista: m.artista,
      isrc,
    });
    merged = mergeApiExplicitTags(merged, { deezer, musicbrainz });
    changed = true;
  }

  if (!changed) return;

  await portalQuery(
    `UPDATE musica_biblioteca
        SET tags_auto = $2::jsonb,
            bpm = COALESCE($3, bpm),
            isrc = COALESCE(isrc, $4),
            ano = COALESCE(ano, $5),
            updated_at = now()
      WHERE id = $1`,
    [musicaId, JSON.stringify(merged), bpm, isrc, ano],
  );
}

/** Reconsulta metadados + gravadora + explicit Deezer/MB. */
export async function refreshInternetTagsForMusica(musicaId: string): Promise<{ updated: boolean; gravadora: string }> {
  const row = await portalQuery<{
    titulo: string;
    artista: string;
    isrc: string | null;
    bpm: number | null;
    tags_auto: unknown;
  }>(
    `SELECT titulo, artista, isrc, bpm, tags_auto FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) throw new Error('not_found');

  const before = JSON.stringify(parseTagsFromJson(m.tags_auto));
  const meta = await applyMetadataEnrichment(m, true);
  let merged = meta.merged;

  const labels = await fetchLabelTags({
    titulo: m.titulo,
    artista: m.artista,
    isrc: meta.isrc,
  });
  if (labels.length > 0) merged = mergeExternalTags(merged, labels);

  const deezer = await fetchDeezerExplicit({ titulo: m.titulo, artista: m.artista });
  const musicbrainz = await fetchMusicBrainzExplicit({
    titulo: m.titulo,
    artista: m.artista,
    isrc: meta.isrc,
  });
  merged = mergeApiExplicitTags(merged, { deezer, musicbrainz });

  const after = JSON.stringify(merged);
  if (before === after && !meta.changed) {
    return { updated: false, gravadora: extractGravadoraFromTags(merged) };
  }

  await portalQuery(
    `UPDATE musica_biblioteca
        SET tags_auto = $2::jsonb,
            bpm = COALESCE($3, bpm),
            isrc = COALESCE(isrc, $4),
            ano = COALESCE(ano, $5),
            updated_at = now()
      WHERE id = $1`,
    [musicaId, JSON.stringify(merged), meta.bpm, meta.isrc, meta.ano],
  );
  return { updated: true, gravadora: extractGravadoraFromTags(merged) };
}

/** Camada 3: Gemini no pipeline pós-upload (se GEMINI_API_KEY configurada). */
export async function enrichGeminiForMusica(musicaId: string): Promise<void> {
  const row = await portalQuery<{ titulo: string; artista: string; tags_auto: unknown }>(
    `SELECT titulo, artista, tags_auto FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const m = row.rows[0];
  if (!m) return;

  const existing = parseTagsFromJson(m.tags_auto);
  if (hasGeminiExplicitCheck(existing)) return;

  const geminiMap = await classifyExplicitLyricsWithGemini([
    { id: musicaId, titulo: m.titulo, artista: m.artista },
  ]);
  const geminiTag = geminiMap.get(musicaId) ?? 'desconhecida';
  const merged = mergeGeminiExplicitCheck(existing, geminiTag);

  await portalQuery(
    `UPDATE musica_biblioteca SET tags_auto = $2::jsonb, updated_at = now() WHERE id = $1`,
    [musicaId, JSON.stringify(merged)],
  );
}

/** Chamado pelo pipeline pós-upload (workers/criacao/pipeline.ts). */
export async function enrichTags(
  musicaId: string,
  _meta?: { artista?: string; titulo?: string; isrc?: string | null },
): Promise<void> {
  await enrichUploadTagsForMusica(musicaId);
  await enrichGeminiForMusica(musicaId);
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
