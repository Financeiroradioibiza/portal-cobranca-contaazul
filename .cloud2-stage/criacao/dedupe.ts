import { spawn } from 'node:child_process';
import { portalQuery } from './portalDb.js';
import { sha256File } from './hash.js';
import { probeDurationMs } from './ffmpeg.js';

/** Tolerância de duração para auto-descartar chromaprint (mesmo critério Servidor UP). */
const CHROMAPRINT_AUTO_DURATION_MS = 4000;
/** Duração quase idêntica + mesmo título → auto (chromaprint já bateu). */
const CHROMAPRINT_EXACT_DURATION_MS = 500;

export type DedupeResult =
  | { kind: 'nova' }
  | {
      kind: 'duplicata';
      existenteId: string;
      via: 'content_hash' | 'chromaprint' | 'metadata' | 'isrc';
    };

export function normalizeMetaForDedupe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Título para dedupe — remove feat/ft e variantes ortográficas comuns. */
export function normalizeTitleForDedupe(s: string): string {
  let t = normalizeMetaForDedupe(s);
  t = t.replace(/\b(feat|ft|featuring|with|vs|x)\b.+$/i, '').trim();
  t = t.replace(/\blivin\b/g, 'living');
  t = t.replace(/\bgoin\b/g, 'going');
  return t.trim();
}

/** Artista — trata e / & / and como equivalentes; remove feat. */
export function normalizeArtistaForDedupe(s: string): string {
  let a = normalizeMetaForDedupe(s);
  a = a.replace(/\b(feat|ft|featuring|with|vs|x)\b.+$/i, '').trim();
  a = a.replace(/\b(and|e|y|et)\b/g, ' ');
  return a.replace(/\s+/g, ' ').trim();
}

function artistaTokensForDedupe(s: string): string[] {
  return normalizeArtistaForDedupe(s)
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function tituloMatchesForDedupe(a: string, b: string): boolean {
  return normalizeTitleForDedupe(a) === normalizeTitleForDedupe(b);
}

/** Remove sufixos de versão no fim — antes de normalizar (só CHECK, não altera dedupe da fila). */
export function stripTitleVersionSuffixesRaw(s: string): string {
  let t = s.trim().replace(/~(\d{1,2})$/i, '').trim();
  for (let i = 0; i < 5; i += 1) {
    const next = t.replace(/\s*\([^)]{1,80}\)\s*$/i, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

/** Título núcleo para CHECK: pasta limpa vs upload com (Single Version), (Live), etc. */
export function tituloCoreForCheck(s: string): string {
  return normalizeTitleForDedupe(stripTitleVersionSuffixesRaw(s));
}

export function tituloMatchesForCheck(a: string, b: string): boolean {
  const ca = tituloCoreForCheck(a);
  const cb = tituloCoreForCheck(b);
  return ca.length >= 2 && cb.length >= 2 && ca === cb;
}

/** Artista equivalente ou subconjunto (ex. «The Police» vs «The Police/Police»). */
export function artistaMatchesForCheck(a: string, b: string): boolean {
  if (artistaMatchesForDedupe(a, b)) return true;
  const ta = new Set(artistaTokensForDedupe(a));
  const tb = new Set(artistaTokensForDedupe(b));
  if (ta.size < 1 || tb.size < 1) return false;
  const [smaller, larger] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  return [...smaller].every((t) => larger.has(t));
}

export function metadataMatchesForCheck(
  uploadArtista: string,
  uploadTitulo: string,
  existArtista: string,
  existTitulo: string,
): boolean {
  if (!tituloMatchesForCheck(uploadTitulo, existTitulo)) return false;
  return artistaMatchesForCheck(uploadArtista, existArtista);
}

/** Mesmo núcleo, mas um lado traz sufixo de versão (Live, Remix, Remaster, etc.) que o outro não. */
export function isCheckVersionVariantPair(a: string, b: string): boolean {
  if (!tituloMatchesForCheck(a, b)) return false;
  return normalizeTitleForDedupe(a) !== normalizeTitleForDedupe(b);
}

export function artistaMatchesForDedupe(a: string, b: string): boolean {
  const na = normalizeArtistaForDedupe(a);
  const nb = normalizeArtistaForDedupe(b);
  if (na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  const ta = new Set(artistaTokensForDedupe(a));
  const tb = new Set(artistaTokensForDedupe(b));
  if (ta.size < 2 || tb.size < 2) return false;
  if (ta.size !== tb.size) return false;
  return [...ta].every((t) => tb.has(t));
}

export function metadataMatchesForDedupe(
  uploadArtista: string,
  uploadTitulo: string,
  existArtista: string,
  existTitulo: string,
): boolean {
  if (!tituloMatchesForDedupe(uploadTitulo, existTitulo)) return false;
  return artistaMatchesForDedupe(uploadArtista, existArtista);
}

async function findDuplicateByIsrc(isrc: string): Promise<{ id: string } | null> {
  const rows = await portalQuery<{ id: string }>(
    `SELECT id FROM musica_biblioteca
     WHERE isrc = $1
       AND status IN ('pronta', 'processando')
     LIMIT 1`,
    [isrc],
  );
  return rows.rows[0] ?? null;
}

async function findDuplicateByMetadata(
  artista: string,
  titulo: string,
): Promise<{ id: string } | null> {
  const nt = normalizeTitleForDedupe(titulo);
  if (normalizeArtistaForDedupe(artista).length < 2 || nt.length < 2) return null;

  const rows = await portalQuery<{ id: string; artista: string; titulo: string }>(
    `SELECT id, artista, titulo FROM musica_biblioteca
     WHERE status IN ('pronta', 'processando')
       AND length(trim(artista)) > 0
       AND length(trim(titulo)) > 0
     ORDER BY updated_at DESC
     LIMIT 8000`,
  );
  for (const row of rows.rows) {
    if (metadataMatchesForDedupe(artista, titulo, row.artista, row.titulo)) {
      return { id: row.id };
    }
  }
  return null;
}

async function tryChromaprint(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('fpcalc', ['-json', '-length', '120', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout?.on('data', (d) => {
      out += String(d);
    });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const j = JSON.parse(out) as { fingerprint?: string };
        const fp = j.fingerprint?.trim();
        resolve(fp && fp.length > 20 ? fp.slice(0, 4000) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** Dedupe por SHA256 + Chromaprint opcional (fpcalc no PATH) + título/artista normalizado. */
export async function findDuplicate(
  filePath: string,
  opts?: {
    skipChromaprintMatchId?: string | null;
    artista?: string;
    titulo?: string;
    isrc?: string | null;
  },
): Promise<DedupeResult & { contentHash: string; chromaprint: string | null }> {
  const contentHash = await sha256File(filePath);

  const byHash = await portalQuery<{ id: string }>(
    `SELECT id FROM musica_biblioteca WHERE content_hash = $1 LIMIT 1`,
    [contentHash],
  );
  if (byHash.rowCount && byHash.rows[0]?.id) {
    return {
      kind: 'duplicata',
      existenteId: byHash.rows[0].id,
      via: 'content_hash',
      contentHash,
      chromaprint: null,
    };
  }

  const isrc = opts?.isrc?.trim() ?? '';
  if (isrc.length >= 10) {
    const byIsrc = await findDuplicateByIsrc(isrc);
    if (byIsrc?.id) {
      return {
        kind: 'duplicata',
        existenteId: byIsrc.id,
        via: 'isrc',
        contentHash,
        chromaprint: null,
      };
    }
  }

  const chromaprint = await tryChromaprint(filePath);
  if (chromaprint) {
    const byFp = await portalQuery<{ id: string }>(
      `SELECT id FROM musica_biblioteca WHERE chromaprint = $1 LIMIT 1`,
      [chromaprint],
    );
    if (byFp.rowCount && byFp.rows[0]?.id) {
      const existenteId = byFp.rows[0].id;
      if (opts?.skipChromaprintMatchId && opts.skipChromaprintMatchId === existenteId) {
        // Revisão humana escolheu «manter como nova» — ignora este fingerprint.
      } else {
        return {
          kind: 'duplicata',
          existenteId,
          via: 'chromaprint',
          contentHash,
          chromaprint,
        };
      }
    }
  }

  const artista = opts?.artista?.trim() ?? '';
  const titulo = opts?.titulo?.trim() ?? '';
  if (artista && titulo) {
    const byMeta = await findDuplicateByMetadata(artista, titulo);
    if (byMeta?.id) {
      return {
        kind: 'duplicata',
        existenteId: byMeta.id,
        via: 'metadata',
        contentHash,
        chromaprint,
      };
    }
  }

  return { kind: 'nova', contentHash, chromaprint };
}

/**
 * Chromaprint + duração ±4s e metadados equivalentes (e/&/and, apóstrofo) → auto-descarte.
 * Chromaprint + duração ≤0,5s + mesmo título → auto (mesmo áudio, artista escrito diferente).
 */
export async function shouldAutoConfirmChromaprintDuplicate(
  existenteId: string,
  uploadArtista: string,
  uploadTitulo: string,
  inputPath: string,
): Promise<boolean> {
  const rows = await portalQuery<{ artista: string; titulo: string; duration_ms: number | null }>(
    `SELECT artista, titulo, duration_ms FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [existenteId],
  );
  const ex = rows.rows[0];
  if (!ex) return false;

  const existMs = ex.duration_ms ?? 0;
  if (existMs <= 0) return false;

  let uploadMs = 0;
  try {
    uploadMs = await probeDurationMs(inputPath);
  } catch {
    return false;
  }
  if (uploadMs <= 0) return false;

  const deltaMs = Math.abs(uploadMs - existMs);
  if (deltaMs > CHROMAPRINT_AUTO_DURATION_MS) return false;

  if (metadataMatchesForDedupe(uploadArtista, uploadTitulo, ex.artista, ex.titulo)) {
    return true;
  }

  return (
    deltaMs <= CHROMAPRINT_EXACT_DURATION_MS &&
    tituloMatchesForDedupe(uploadTitulo, ex.titulo)
  );
}
