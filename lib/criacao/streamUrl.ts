import crypto from "node:crypto";
import { CRIACAO_INGEST_URL } from "./ingestTicket";

/**
 * URL assinada (HMAC-SHA256) para tocar a versão de USO de uma música direto do cloud2.
 * O áudio NUNCA passa pelo Netlify — o navegador busca direto em cloud2/criacao/audio.
 * Verificador correspondente: portal-ibiza/src/criacao/streamToken.ts
 */

const SECRET = process.env.CRIACAO_INGEST_SECRET ?? "";

/** Base de áudio derivada da URL de ingest (…/criacao/ingest -> …/criacao/audio). */
const AUDIO_BASE = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/audio");

/** Validade do link de preview: 8h (cobre uma jornada de trabalho do criativo). */
const TTL_MS = 8 * 60 * 60 * 1000;

export function streamEnabled(): boolean {
  return SECRET.length > 0;
}

/** Gera a URL tocável da versão de uso (padrão 128k mono). Retorna null se desabilitado. */
export function buildPreviewUrl(
  musicaId: string,
  formato = "mp3_128_mono",
  ttlMs: number = TTL_MS,
): string | null {
  if (!SECRET) return null;
  const exp = Date.now() + ttlMs;
  const base = `${musicaId}.${formato}.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(base).digest("hex");
  const qs = new URLSearchParams({ f: formato, exp: String(exp), token: sig });
  return `${AUDIO_BASE}/${musicaId}?${qs.toString()}`;
}
