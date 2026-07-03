/**
 * Integração com Spotizerr (auto-hospedado, porta padrão 7171).
 *
 * Spotizerr faz o download de tracks, albums e playlists do Spotify
 * convertendo para MP3 192k (ou formato configurado no Spotizerr).
 *
 * API relevante (compatível com AlbumWhileTaking/spotizerr):
 *   POST /api/v1/track       { url: "https://open.spotify.com/track/..." }
 *   POST /api/v1/album       { url: "https://open.spotify.com/album/..." }
 *   POST /api/v1/playlist    { url: "https://open.spotify.com/playlist/..." }
 *   GET  /api/v1/job/<id>    { status: "completed"|"failed"|"pending"|..., file_path: "..." }
 *
 * Quando o download conclui, Spotizerr salva o(s) arquivo(s) em um
 * diretório local. Este worker faz upload desse arquivo para o R2.
 */

import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { uploadToR2 } from "../r2.ts";

const SPOTIZERR_URL = (process.env.CRIACAO_SPOTIZERR_URL ?? "").replace(/\/$/, "");
const SPOTIZERR_TOKEN = process.env.CRIACAO_SPOTIZERR_TOKEN ?? "";
const STAGING_DIR = process.env.CRIACAO_DOWNLOAD_STAGING_DIR ?? "/data/staging";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

type SpotizerJobStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | string;

type SpotizerJobResponse = {
  job_id?: string;
  status?: SpotizerJobStatus;
  file_path?: string;
  title?: string;
  artist?: string;
  error?: string;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SPOTIZERR_TOKEN) h.Authorization = `Bearer ${SPOTIZERR_TOKEN}`;
  return h;
}

/** Detecta o tipo de URL do Spotify e retorna o endpoint correto. */
function spotifyEndpoint(url: string): string {
  if (/\/album\//i.test(url)) return "/api/v1/album";
  if (/\/playlist\//i.test(url)) return "/api/v1/playlist";
  if (/\/artist\//i.test(url)) return "/api/v1/artist";
  return "/api/v1/track";
}

/** Envia uma URL Spotify para o Spotizerr e retorna o job_id. */
async function submitToSpotizerr(url: string): Promise<string> {
  const endpoint = spotifyEndpoint(url);
  const res = await fetch(`${SPOTIZERR_URL}${endpoint}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Spotizerr ${endpoint} retornou ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as SpotizerJobResponse;
  const jobId = data.job_id ?? String(data);
  if (!jobId) throw new Error("Spotizerr não retornou job_id");
  return jobId;
}

/** Aguarda o job_id do Spotizerr concluir com polling. */
async function waitForSpotizerr(jobId: string): Promise<SpotizerJobResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${SPOTIZERR_URL}/api/v1/job/${jobId}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Spotizerr /job/${jobId} retornou ${res.status}`);
    const data = (await res.json()) as SpotizerJobResponse;

    if (data.status === "completed") return data;
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(`Spotizerr falhou: ${data.error ?? data.status}`);
    }

    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timeout aguardando Spotizerr");
}

/** Busca texto livre no Spotizerr (não é URL — tenta "pesquisa por nome"). */
async function submitTextSearch(texto: string): Promise<string> {
  // Spotizerr aceita URL direto, mas para texto livre usamos o endpoint de search se disponível.
  // Fallback: tentamos como URL de pesquisa do Spotify (não funciona, mas Spotizerr pode ter endpoint).
  // Se não funcionar, retorna erro explicativo.
  const res = await fetch(`${SPOTIZERR_URL}/api/v1/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query: texto, type: "track", limit: 1 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      `Spotizerr search retornou ${res.status}. Para texto livre, prefira o formato «Artista - Música» e pesquise pelo Spotify antes de colar a URL.`,
    );
  }
  const data = (await res.json()) as { results?: Array<{ url?: string }> };
  const url = data.results?.[0]?.url;
  if (!url) throw new Error("Spotizerr search não retornou resultados para: " + texto.slice(0, 80));
  return submitToSpotizerr(url);
}

type ProcessResult =
  | { ok: true; storageKey: string; arquivoNome: string; titulo: string; artista: string; sizeBytes: number | null }
  | { ok: false; error: string };

/**
 * Processa um item de download via Spotizerr.
 * - itemId: usado para nomear o arquivo no R2
 * - linhaOriginal: URL do Spotify ou texto livre «Artista - Música»
 */
export async function processSpotizerr(itemId: string, linhaOriginal: string): Promise<ProcessResult> {
  if (!SPOTIZERR_URL) {
    return { ok: false, error: "CRIACAO_SPOTIZERR_URL não configurada no cloud2." };
  }

  try {
    const isUrl = /^https?:\/\//i.test(linhaOriginal);
    const jobId = isUrl
      ? await submitToSpotizerr(linhaOriginal)
      : await submitTextSearch(linhaOriginal);

    const result = await waitForSpotizerr(jobId);

    // Localiza o arquivo no staging dir (Spotizerr salva localmente)
    const filePath = result.file_path
      ? join(STAGING_DIR, result.file_path)
      : null;

    if (!filePath || !existsSync(filePath)) {
      // Se Spotizerr não retornou file_path, tenta encontrar pelo jobId no staging
      throw new Error(
        `Arquivo não encontrado em ${filePath ?? STAGING_DIR}. ` +
          "Verifique se o volume do Spotizerr está montado em CRIACAO_DOWNLOAD_STAGING_DIR.",
      );
    }

    const filename = basename(filePath);
    // JobId do portal como sufixo para evitar colisão
    const r2Filename = `${itemId.slice(0, 8)}_${filename}`;
    const storageKey = await uploadToR2({
      localPath: filePath,
      provider: "spotizerr",
      jobId: itemId,
      filename: r2Filename,
    });

    const { statSync } = await import("node:fs");
    const sizeBytes = statSync(filePath).size;

    return {
      ok: true,
      storageKey,
      arquivoNome: filename,
      titulo: result.title ?? filename.replace(/\.mp3$/i, ""),
      artista: result.artist ?? "",
      sizeBytes,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
