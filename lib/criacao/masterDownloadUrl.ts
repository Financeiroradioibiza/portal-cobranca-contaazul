import crypto from "node:crypto";
import { CRIACAO_INGEST_URL } from "./ingestTicket";

const SECRET = (process.env.CRIACAO_INGEST_SECRET ?? "").trim();

/** Base master 192k no cloud2 (…/criacao/ingest → …/criacao/master). */
const MASTER_BASE = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/master");

/** Validade do link de download master: 4h (montagem do ZIP no browser). */
const TTL_MS = 4 * 60 * 60 * 1000;

/** Download habilitado — entrega via cloud3 (worker CF → B2). */
export function masterDownloadEnabled(): boolean {
  return SECRET.length > 0;
}

export type MasterDownloadMode = "cloud3" | "unavailable";

/** Modo fixo: cloud3 assinado (mesmo padrão do player). */
export function masterDownloadMode(): MasterDownloadMode {
  return SECRET.length > 0 ? "cloud3" : "unavailable";
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
