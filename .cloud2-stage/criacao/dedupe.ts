import { spawn } from 'node:child_process';
import { portalQuery } from './portalDb.js';
import { sha256File } from './hash.js';

export type DedupeResult =
  | { kind: 'nova' }
  | { kind: 'duplicata'; existenteId: string; via: 'content_hash' | 'chromaprint' };

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

/** Dedupe por SHA256 + Chromaprint opcional (fpcalc no PATH). */
export async function findDuplicate(filePath: string): Promise<DedupeResult & { contentHash: string; chromaprint: string | null }> {
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
      return {
        kind: 'duplicata',
        existenteId: byFp.rows[0].id,
        via: 'chromaprint',
        contentHash,
        chromaprint,
      };
    }
  }

  return { kind: 'nova', contentHash, chromaprint };
}
