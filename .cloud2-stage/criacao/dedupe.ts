import { spawn } from 'node:child_process';
import { portalQuery } from './portalDb.js';
import { sha256File } from './hash.js';

export type DedupeResult =
  | { kind: 'nova' }
  | { kind: 'duplicata'; existenteId: string; via: 'content_hash' | 'chromaprint' | 'metadata' };

export function normalizeMetaForDedupe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function findDuplicateByMetadata(
  artista: string,
  titulo: string,
): Promise<{ id: string } | null> {
  const na = normalizeMetaForDedupe(artista);
  const nt = normalizeMetaForDedupe(titulo);
  if (na.length < 2 || nt.length < 2) return null;

  const rows = await portalQuery<{ id: string; artista: string; titulo: string }>(
    `SELECT id, artista, titulo FROM musica_biblioteca
     WHERE status IN ('pronta', 'processando')
       AND length(trim(artista)) > 0
       AND length(trim(titulo)) > 0
     ORDER BY updated_at DESC
     LIMIT 8000`,
  );
  for (const row of rows.rows) {
    if (normalizeMetaForDedupe(row.artista) === na && normalizeMetaForDedupe(row.titulo) === nt) {
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
  opts?: { skipChromaprintMatchId?: string | null; artista?: string; titulo?: string },
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
