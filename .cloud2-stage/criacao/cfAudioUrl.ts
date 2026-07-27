/**
 * Fase C — URLs assinadas cloud3 para entrega .rib (Player v2).
 * Default off: PLAYER5_ENTREGA_CF=0 → playlist continua get_musica.
 */
import crypto from 'node:crypto';
import { criacaoConfig } from './config.js';
import {
  s3KeyFromVersaoStorageKey,
  usoB2ObjectKey,
  usoRelFromStorageKey,
} from './storage.js';

const FORMATO_USO = 'mp3_128_mono';

export function player5EntregaCfEnabled(): boolean {
  const v = (process.env.PLAYER5_ENTREGA_CF ?? '0').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function cfAudioDomain(): string {
  const raw = (process.env.CF_AUDIO_DOMAIN ?? '').trim();
  return raw || 'cloud3.radioibiza.app.br';
}

export function cfAudioSignTtlSec(): number {
  const n = Number(process.env.CF_AUDIO_SIGN_TTL_SEC ?? '3600');
  if (!Number.isFinite(n) || n < 60) return 3600;
  return Math.min(Math.floor(n), 86400);
}

function compareSemverLoose(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** PDV piloto (PLAYER5_ENTREGA_CF_PDV_IDS) ou versao_player >= PLAYER5_CF_MIN_VERSION. */
export async function pdvUsaEntregaCf(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ versao_player?: string | null }> }> },
  pdvId: number,
): Promise<boolean> {
  if (!player5EntregaCfEnabled()) return false;

  const pilotRaw = (process.env.PLAYER5_ENTREGA_CF_PDV_IDS ?? '').trim();
  if (pilotRaw) {
    const ids = pilotRaw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) return ids.includes(String(pdvId));
  }

  const minVer = (process.env.PLAYER5_CF_MIN_VERSION ?? '').trim();
  if (!minVer) return false;

  const r = await pool.query(`SELECT versao_player FROM pdvs WHERE id = $1 LIMIT 1`, [pdvId]);
  const ver = String(r.rows[0]?.versao_player ?? '').trim();
  if (!ver) return false;
  return compareSemverLoose(ver, minVer) >= 0;
}

/** Key S3/B2 (`uso/musicas/...`) a partir de storage_key gateway ou musica_id. */
export function b2ObjectKeyForMusica(
  storageKey: string | null | undefined,
  musicaId: string,
): string | null {
  const key = String(storageKey ?? '').trim();
  if (key) {
    const b2 = s3KeyFromVersaoStorageKey(key);
    if (b2) return b2;
    if (key.startsWith('uso:')) {
      const rel = usoRelFromStorageKey(key);
      const prefix = criacaoConfig.b2.usoPrefix.replace(/\/?$/, '/');
      return `${prefix}${rel}`;
    }
  }
  const id = musicaId.trim();
  if (!id) return null;
  return usoB2ObjectKey(id, FORMATO_USO, '.rib');
}

export function signCfAudioPayload(objectKey: string, exp: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${objectKey}:${exp}`).digest('hex');
}

export function signCfAudioObjectKey(objectKey: string): string | null {
  const secret = criacaoConfig.ingestSecret;
  const domain = cfAudioDomain();
  if (!secret || !domain || !objectKey) return null;

  const exp = Math.floor(Date.now() / 1000) + cfAudioSignTtlSec();
  const sig = signCfAudioPayload(objectKey, exp, secret);
  const path = objectKey.startsWith('/') ? objectKey : `/${objectKey}`;
  return `https://${domain.replace(/\/$/, '')}${path}?exp=${exp}&sig=${sig}`;
}

export function buildLegacyGetMusicaUrl(params: {
  baseUrl: string;
  token: string;
  musicaId: number;
  playlistId: number;
}): string {
  return `${params.baseUrl}/api/get_musica/?token=${encodeURIComponent(params.token)}&id_musica=${params.musicaId}&playlist_id=${params.playlistId}`;
}

/** url_musica na playlist — CF assinada se useCf; senão get_musica (v1). */
export function buildPlaylistUrlMusica(params: {
  baseUrl: string;
  token: string;
  musicaId: number;
  playlistId: number;
  storageKey: string | null;
  useCf: boolean;
}): string {
  const legacy = buildLegacyGetMusicaUrl(params);
  if (!params.useCf) return legacy;

  const objectKey = b2ObjectKeyForMusica(params.storageKey, String(params.musicaId));
  if (!objectKey) return legacy;

  return signCfAudioObjectKey(objectKey) ?? legacy;
}
