import { b2Enabled, criacaoConfig } from './config.js';
import { headB2Object } from './b2.js';
import { portalQuery } from './portalDb.js';
import { s3KeyFromVersaoStorageKey } from './storage.js';

export type B2AuditRow = {
  musicaId: string;
  storageKey: string;
  expectedBytes: number | null;
  remoteBytes: number | null;
  reason: 'ausente_no_b2' | 'tamanho_diferente' | 'ok';
};

export type B2StorageAuditReport = {
  ok: boolean;
  collectedAt: string;
  b2Enabled: boolean;
  bucket: string;
  masters: {
    scanned: number;
    ok: number;
    missing: B2AuditRow[];
    sizeMismatch: B2AuditRow[];
  };
  uso128: {
    scanned: number;
    ok: number;
    missing: B2AuditRow[];
    sizeMismatch: B2AuditRow[];
  };
};

function masterObjectKeyFromNeon(masterStorageKey: string): string | null {
  const k = masterStorageKey.trim();
  if (!k || k.startsWith('local:')) return null;
  if (k.startsWith('b2:')) return k.slice(3);
  if (k.includes('/') && k.endsWith('.mp3')) return k;
  return null;
}

async function auditRows(
  rows: { id: string; key: string; expectedBytes: number | null }[],
): Promise<{ ok: number; missing: B2AuditRow[]; sizeMismatch: B2AuditRow[] }> {
  let ok = 0;
  const missing: B2AuditRow[] = [];
  const sizeMismatch: B2AuditRow[] = [];

  for (const row of rows) {
    const head = await headB2Object(row.key);
    if (!head) {
      missing.push({
        musicaId: row.id,
        storageKey: row.key,
        expectedBytes: row.expectedBytes,
        remoteBytes: null,
        reason: 'ausente_no_b2',
      });
      continue;
    }
    if (row.expectedBytes != null && row.expectedBytes > 0 && head.sizeBytes !== row.expectedBytes) {
      sizeMismatch.push({
        musicaId: row.id,
        storageKey: row.key,
        expectedBytes: row.expectedBytes,
        remoteBytes: head.sizeBytes,
        reason: 'tamanho_diferente',
      });
      continue;
    }
    ok += 1;
  }

  return { ok, missing, sizeMismatch };
}

/** Compara Neon (masters + versões b2:) com HeadObject no bucket. */
export async function runB2StorageAudit(opts?: { limit?: number }): Promise<B2StorageAuditReport> {
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 5000);
  const empty: B2StorageAuditReport = {
    ok: false,
    collectedAt: new Date().toISOString(),
    b2Enabled: b2Enabled(),
    bucket: criacaoConfig.b2.bucket,
    masters: { scanned: 0, ok: 0, missing: [], sizeMismatch: [] },
    uso128: { scanned: 0, ok: 0, missing: [], sizeMismatch: [] },
  };

  if (!b2Enabled()) {
    return empty;
  }

  const mastersRes = await portalQuery<{ id: string; master_storage_key: string }>(
    `SELECT id, master_storage_key
       FROM musica_biblioteca
      WHERE master_storage_key IS NOT NULL
        AND master_storage_key NOT LIKE 'local:%'
      ORDER BY updated_at DESC
      LIMIT $1`,
    [limit],
  );

  const masterRows: { id: string; key: string; expectedBytes: number | null }[] = [];
  for (const r of mastersRes.rows) {
    const key = masterObjectKeyFromNeon(r.master_storage_key);
    if (key) masterRows.push({ id: r.id, key, expectedBytes: null });
  }

  const usoRes = await portalQuery<{ musica_id: string; storage_key: string; size_bytes: number | null }>(
    `SELECT musica_id, storage_key, size_bytes
       FROM musica_versao
      WHERE storage_key LIKE 'b2:%'
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );

  const usoRows: { id: string; key: string; expectedBytes: number | null }[] = [];
  for (const r of usoRes.rows) {
    const key = s3KeyFromVersaoStorageKey(r.storage_key);
    if (key) {
      usoRows.push({
        id: r.musica_id,
        key,
        expectedBytes: r.size_bytes,
      });
    }
  }

  const [mastersAudit, usoAudit] = await Promise.all([auditRows(masterRows), auditRows(usoRows)]);

  return {
    ok:
      mastersAudit.missing.length === 0 &&
      mastersAudit.sizeMismatch.length === 0 &&
      usoAudit.missing.length === 0 &&
      usoAudit.sizeMismatch.length === 0,
    collectedAt: new Date().toISOString(),
    b2Enabled: true,
    bucket: criacaoConfig.b2.bucket,
    masters: {
      scanned: masterRows.length,
      ok: mastersAudit.ok,
      missing: mastersAudit.missing,
      sizeMismatch: mastersAudit.sizeMismatch,
    },
    uso128: {
      scanned: usoRows.length,
      ok: usoAudit.ok,
      missing: usoAudit.missing,
      sizeMismatch: usoAudit.sizeMismatch,
    },
  };
}

/** HEAD rápido de uma faixa (master + versão 128 b2). */
export async function verifyMusicaOnB2(musicaId: string): Promise<{
  musicaId: string;
  master: { key: string; ok: boolean; bytes: number | null };
  uso128: { key: string | null; ok: boolean; bytes: number | null; neonKey: string | null };
}> {
  const musica = await portalQuery<{ master_storage_key: string | null }>(
    `SELECT master_storage_key FROM musica_biblioteca WHERE id = $1 LIMIT 1`,
    [musicaId],
  );
  const ver = await portalQuery<{ storage_key: string; size_bytes: number | null }>(
    `SELECT storage_key, size_bytes FROM musica_versao WHERE musica_id = $1 AND formato::text = 'mp3_128_mono' LIMIT 1`,
    [musicaId],
  );

  const masterKey =
    musica.rows[0]?.master_storage_key ?
      masterObjectKeyFromNeon(musica.rows[0].master_storage_key)
    : null;
  const masterHead = masterKey ? await headB2Object(masterKey) : null;

  const neonUso = ver.rows[0]?.storage_key ?? null;
  const usoKey = neonUso ? s3KeyFromVersaoStorageKey(neonUso) : null;
  const expectedUso = ver.rows[0]?.size_bytes ?? null;

  let uso128Ok = true;
  let usoBytes: number | null = null;
  if (usoKey) {
    const usoHead = await headB2Object(usoKey);
    usoBytes = usoHead?.sizeBytes ?? null;
    uso128Ok = Boolean(
      usoHead && (expectedUso == null || expectedUso <= 0 || usoHead.sizeBytes === expectedUso),
    );
  }

  return {
    musicaId,
    master: {
      key: masterKey ?? '',
      ok: Boolean(masterKey && masterHead),
      bytes: masterHead?.sizeBytes ?? null,
    },
    uso128: {
      key: usoKey,
      neonKey: neonUso,
      ok: uso128Ok,
      bytes: usoBytes,
    },
  };
}
