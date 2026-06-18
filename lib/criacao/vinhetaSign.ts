import crypto from "node:crypto";
import { CRIACAO_INGEST_URL } from "./ingestTicket";

/**
 * Tickets de vinheta (HMAC-SHA256). Formato: vinhetaId.exp.sig
 * Vale para enviar o áudio (vinheta-ingest) e tocar (vinheta-audio) direto no cloud2.
 * Verificador: portal-ibiza/src/routes/criacao/vinheta.ts
 */

const SECRET = process.env.CRIACAO_INGEST_SECRET ?? "";

const VINHETA_INGEST_URL = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/vinheta-ingest");
const VINHETA_AUDIO_BASE = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/vinheta-audio");

const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 8 * 60 * 60 * 1000;

export function vinhetaEnabled(): boolean {
  return SECRET.length > 0;
}

export function vinhetaIngestUrl(): string {
  return VINHETA_INGEST_URL;
}

function sign(vinhetaId: string, ttlMs: number): { token: string; exp: number } {
  const exp = Date.now() + ttlMs;
  const base = `${vinhetaId}.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(base).digest("hex");
  return { token: `${base}.${sig}`, exp };
}

export function signVinhetaUpload(vinhetaId: string): { token: string; exp: number } {
  return sign(vinhetaId, UPLOAD_TTL_MS);
}

export function buildVinhetaPreviewUrl(vinhetaId: string): string | null {
  if (!SECRET) return null;
  const { token, exp } = sign(vinhetaId, PREVIEW_TTL_MS);
  const sig = token.split(".")[2];
  const qs = new URLSearchParams({ exp: String(exp), token: sig });
  return `${VINHETA_AUDIO_BASE}/${vinhetaId}?${qs.toString()}`;
}
