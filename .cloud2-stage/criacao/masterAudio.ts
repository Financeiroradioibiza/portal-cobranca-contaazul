import { getB2ObjectBuffer } from './b2.js';
import { portalQuery } from './portalDb.js';
import { masterStorageKey } from './storage.js';

function resolveB2KeyFromNeonKey(raw: string | null | undefined, musicaId: string): string | null {
  const k = raw?.trim() ?? '';
  if (k.startsWith('local:')) return null;
  if (k.startsWith('b2:')) return k.slice(3);
  if (k) return k;
  return masterStorageKey(musicaId);
}

/** Master 192 kbps no B2 (ou fallback key padrão). */
export async function resolveMaster192Buffer(musicaId: string): Promise<Buffer | null> {
  const id = musicaId.trim();
  if (!id) return null;

  let neonKey: string | null = null;
  try {
    const res = await portalQuery<{ master_storage_key: string | null }>(
      `SELECT master_storage_key FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
      [id],
    );
    neonKey = res.rows[0]?.master_storage_key ?? null;
  } catch {
    /* pool indisponível — tenta key padrão */
  }

  const b2Key = resolveB2KeyFromNeonKey(neonKey, id);
  if (!b2Key) return null;
  return getB2ObjectBuffer(b2Key);
}
