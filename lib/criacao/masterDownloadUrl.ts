import crypto from "node:crypto";
import { CRIACAO_INGEST_URL } from "./ingestTicket";

const SECRET = process.env.CRIACAO_INGEST_SECRET ?? "";

/** Base master 192k no cloud2 (…/criacao/ingest → …/criacao/master). */
const MASTER_BASE = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/master");

/** Validade do link de download master: 4h (montagem do ZIP no browser). */
const TTL_MS = 4 * 60 * 60 * 1000;

export function masterDownloadEnabled(): boolean {
  return SECRET.length > 0;
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
