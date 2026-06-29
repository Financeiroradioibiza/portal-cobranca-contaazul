import crypto from "node:crypto";

/**
 * Ticket de upload assinado (HMAC-SHA256) que o navegador usa para enviar o binário
 * DIRETO para o cloud2 (/criacao/ingest) — sem passar pelo Netlify.
 * Formato: itemId.jobId.exp.sig  (igual ao verificador em portal-ibiza/src/criacao/ingestToken.ts)
 */

const SECRET = process.env.CRIACAO_INGEST_SECRET ?? "";

/** URL pública de ingest no cloud2 (binários entram por aqui, não pelo Netlify). */
export const CRIACAO_INGEST_URL =
  process.env.CRIACAO_CLOUD2_INGEST_URL ?? "https://cloud2.radioibiza.app.br/criacao/ingest";

export const VINHETA_IA_MIX_URL = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/vinheta-ia-mix");
export const VINHETA_CLONE_URL = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/vinheta-clone");

/** Validade padrão do ticket: 2h (tempo de sobra para subir uma pasta grande). */
const TTL_MS = 2 * 60 * 60 * 1000;

export function ingestEnabled(): boolean {
  return SECRET.length > 0;
}

export function signTicket(itemId: string, jobId: string, ttlMs: number = TTL_MS): { token: string; exp: number } {
  const exp = Date.now() + ttlMs;
  const base = `${itemId}.${jobId}.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(base).digest("hex");
  return { token: `${base}.${sig}`, exp };
}
