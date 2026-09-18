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

export type MasterDownloadMode = "portal_b2" | "unavailable";

/** Modo ativo para Baixar Playlists (hoje exige B2 no Netlify; cloud2 /criacao/master ainda não está no ar). */
export function masterDownloadMode(): MasterDownloadMode {
  return b2MasterFetchEnabled() ? "portal_b2" : "unavailable";
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
