import { CRIACAO_INGEST_URL } from "./ingestTicket";

/** Base do cloud2 (…/criacao/ingest → …/criacao). */
export const CRIACAO_CLOUD2_BASE = CRIACAO_INGEST_URL.replace(/\/ingest$/, "");

const SECRET = process.env.CRIACAO_INGEST_SECRET ?? "";

export function cloud2Enabled(): boolean {
  return SECRET.length > 0;
}

/** Chamada autenticada ao cloud2 (server-side only). */
export async function cloud2Fetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!SECRET) throw new Error("cloud2_desabilitado");
  const url = CRIACAO_CLOUD2_BASE + path;
  const headers = new Headers(init.headers);
  headers.set("x-criacao-secret", SECRET);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}
