/**
 * Entrega Player 5 — músicas ambiente via cloud3 (B2 .rib); vinhetas VP/VA via get_musica (disco cloud2).
 * Contrato permanente: ver docs/CLOUD2-ENV-OBRIGATORIO.md § Vinhetas.
 * Default **on** (`PLAYER5_ENTREGA_CF` ausente = cloud3 para músicas). Rollback consciente: `=0`.
 */
import crypto from 'node:crypto';
import { criacaoConfig } from './config.js';
import {
  s3KeyFromVersaoStorageKey,
  usoB2ObjectKey,
  usoPublicRibBasename,
  usoRelFromStorageKey,
} from './storage.js';

const FORMATO_USO = 'mp3_128_mono';

/** `false` só com PLAYER5_ENTREGA_CF=0|false|off (rollback explícito). */
export function player5EntregaCfEnabled(): boolean {
  const v = (process.env.PLAYER5_ENTREGA_CF ?? '1').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return v === '1' || v === 'true' || v === 'on' || v === '';
}

/** Log único no boot da API — alerta se alguém desligou cloud3 sem querer. */
export function assertPlayer5Cloud3EntregaAtBoot(): void {
  if (player5EntregaCfEnabled()) {
    console.info('[player5-entrega] cloud3 ativo (%s)', cfAudioDomain());
    return;
  }
  console.error(
    '[player5-entrega] INCIDENTE: PLAYER5_ENTREGA_CF desligado — playlist volta get_musica e Player 5 v2 para. ' +
      'Rollback só com OK explícito do Rafael.',
  );
}

export function cfAudioDomain(): string {
  const raw = (process.env.CF_AUDIO_DOMAIN ?? '').trim();
  return raw || 'cloud3.radioibiza.app.br';
}

assertPlayer5Cloud3EntregaAtBoot();

export function cfAudioSignTtlSec(): number {
  const n = Number(process.env.CF_AUDIO_SIGN_TTL_SEC ?? '3600');
  if (!Number.isFinite(n) || n < 60) return 3600;
  return Math.min(Math.floor(n), 86400);
}

/**
 * Com PLAYER5_ENTREGA_CF=1, todos os PDVs no webservice cloud2 recebem cloud3.
 * (Player 4 continua em cloud.radioibiza.com.br — outro servidor.)
 * Piloto opcional: PLAYER5_ENTREGA_CF_PDV_IDS (rollback / homolog).
 */
export async function pdvUsaEntregaCf(
  _pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
  pdvId: number,
): Promise<boolean> {
  if (!player5EntregaCfEnabled()) return false;

  const pilotRaw = (process.env.PLAYER5_ENTREGA_CF_PDV_IDS ?? '').trim();
  if (pilotRaw) {
    const ids = pilotRaw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) return ids.includes(String(pdvId));
  }

  return true;
}

/** Vinhetas (normal + IA/trilha) continuam no disco cloud2 — não migradas pro B2. */
export function isVinhetaStorageKey(storageKey: string | null | undefined): boolean {
  const key = String(storageKey ?? '').trim();
  return key.startsWith('vinheta:') || key.startsWith('vinheta-trilha:');
}

export function isVinhetaOrigemMusicaId(origemMusicaId: string | null | undefined): boolean {
  const o = String(origemMusicaId ?? '').trim();
  return o.startsWith('vinheta:');
}

export function isVinhetaPlaylistTipo(playlistTipo: string | null | undefined): boolean {
  const t = String(playlistTipo ?? '').trim().toUpperCase();
  return t === 'VP' || t === 'VA';
}

/** Key S3/B2 (`uso/musicas/...`) a partir de storage_key gateway ou musica_id. */
export function b2ObjectKeyForMusica(
  storageKey: string | null | undefined,
  musicaId: string,
): string | null {
  const key = String(storageKey ?? '').trim();
  if (key) {
    if (isVinhetaStorageKey(key)) return null;
    const b2 = s3KeyFromVersaoStorageKey(key);
    if (b2) return b2;
    if (key.startsWith('uso:')) {
      const rel = usoRelFromStorageKey(key);
      const prefix = criacaoConfig.b2.usoPrefix.replace(/\/?$/, '/');
      return `${prefix}${rel}`;
    }
    return null;
  }
  const id = musicaId.trim();
  if (!id) return null;
  return usoB2ObjectKey(id, FORMATO_USO, '.rib');
}

/** Key assinada na URL cloud3 — nome opaco (msk.rib), caminho do storage_key interno. */
export function b2PublicDeliveryObjectKey(
  storageKey: string | null | undefined,
  musicaId: string,
): string | null {
  const internal = b2ObjectKeyForMusica(storageKey, musicaId);
  if (!internal) return null;
  if (!internal.endsWith('.rib')) return internal;
  return internal.replace(/\/[^/]+\.rib$/i, `/${usoPublicRibBasename()}.rib`);
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

/** url_musica na playlist — cloud3 assinada se useCf; get_musica só com PLAYER5_ENTREGA_CF=0. */
export function buildPlaylistUrlMusica(params: {
  baseUrl: string;
  token: string;
  musicaId: number;
  playlistId: number;
  storageKey: string | null;
  origemMusicaId?: string | null;
  playlistTipo?: string | null;
  useCf: boolean;
}): string {
  if (
    !params.useCf ||
    isVinhetaStorageKey(params.storageKey) ||
    isVinhetaOrigemMusicaId(params.origemMusicaId) ||
    isVinhetaPlaylistTipo(params.playlistTipo)
  ) {
    return buildLegacyGetMusicaUrl(params);
  }

  const objectKey = b2PublicDeliveryObjectKey(params.storageKey, String(params.musicaId));
  const signed = objectKey ? signCfAudioObjectKey(objectKey) : null;
  if (signed) return signed;

  console.error('[cfAudioUrl] cloud3 indisponível musica_id=%s playlist_id=%s', params.musicaId, params.playlistId);
  return '';
}
