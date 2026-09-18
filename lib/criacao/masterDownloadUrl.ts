import crypto from "node:crypto";
import { b2MasterFetchEnabled } from "@/lib/criacao/b2MasterFetch";
import { CRIACAO_INGEST_URL } from "./ingestTicket";

const SECRET = process.env.CRIACAO_INGEST_SECRET ?? "";

/** Base master 192k no cloud2 (…/criacao/ingest → …/criacao/master). */
const MASTER_BASE = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/master");

/** Validade do link de download master: 4h (montagem do ZIP no browser). */
const TTL_MS = 4 * 60 * 60 * 1000;

/** Download habilitado — exige B2 no Netlify (proxy portal) ou rota /criacao/master no cloud2. */
export function masterDownloadEnabled(): boolean {
  return b2MasterFetchEnabled() || SECRET.length > 0;
}

/** B2 configurado no portal (caminho preferido em produção). */
export function masterDownloadViaPortalB2(): boolean {
  return b2MasterFetchEnabled();
}

/** URL same-origin — proxy do portal (B2 direto ou fallback cloud2). */
export function buildMaster192PortalDownloadUrl(musicaId: string): string | null {
  if (!masterDownloadEnabled()) return null;
  const id = musicaId.trim();
  if (!id) return null;
  return `/api/criacao/baixar-playlists/master/${encodeURIComponent(id)}`;
}

export type MasterDownloadMode = "cloud3" | "portal_b2" | "unavailable";

/** Modo ativo para Baixar Playlists. Preferência: cloud3 (CF) → proxy B2 no Netlify. */
export function masterDownloadMode(): MasterDownloadMode {
  if (SECRET.length > 0) return "cloud3";
  if (b2MasterFetchEnabled()) return "portal_b2";
  return "unavailable";
}

/** URL assinada cloud3 — master 192k via worker CF (CORS ok, sem proxy Netlify). */
export function buildCloud3Master192DownloadUrl(
  objectKey: string,
  ttlMs: number = TTL_MS,
): string | null {
  if (!SECRET) return null;
  const key = objectKey.trim();
  if (!key) return null;
  const exp = Math.floor((Date.now() + ttlMs) / 1000);
  const sig = crypto.createHmac("sha256", SECRET).update(`${key}:${exp}`).digest("hex");
  const domain = (process.env.CF_AUDIO_DOMAIN ?? "cloud3.radioibiza.app.br")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const qs = new URLSearchParams({ exp: String(exp), sig });
  return `https://${domain}/${key}?${qs.toString()}`;
}

/** URL assinada para baixar master 192 kbps do B2 via cloud2. */
export function buildMaster192DownloadUrl(musicaId: string, ttlMs: number = TTL_MS): string | null {
  if (!SECRET) return null;
  const id = musicaId.trim();
  if (!id) return null;
  const exp = Date.now() + ttlMs;
  const base = `${id}.master192.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(base).digest("hex");
  const qs = new URLSearchParams({ exp: String(exp), token: sig });
  return `${MASTER_BASE}/${encodeURIComponent(id)}?${qs.toString()}`;
}
