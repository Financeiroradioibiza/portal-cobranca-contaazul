/**
 * Integração com yt-dlp via HTTP API.
 *
 * Opções de backend:
 *  a) yt-dlp-server (port 3000) — API REST para submeter downloads
 *  b) yt-dlp-web-ui
 *
 * Se CRIACAO_YOUTUBE_DL_URL não estiver configurado,
 * o worker usa yt-dlp CLI diretamente (deve estar instalado no PATH).
 *
 * API yt-dlp-server:
 *   POST /api/queue   { url }  → { id }
 *   GET  /api/queue/<id>       → { status, progress, filename }
 */

import { join, basename } from "node:path";
import { existsSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { uploadToR2 } from "../r2.ts";

const execFileAsync = promisify(execFile);

const YTDL_URL = (process.env.CRIACAO_YOUTUBE_DL_URL ?? "").replace(/\/$/, "");
const STAGING_DIR = process.env.CRIACAO_DOWNLOAD_STAGING_DIR ?? "/data/staging";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000; // 20 min

type YtdlServerStatus = {
  status?: string;
  progress?: number;
  filename?: string;
  title?: string;
  artist?: string;
};

type ProcessResult =
  | { ok: true; storageKey: string; arquivoNome: string; titulo: string; artista: string; sizeBytes: number | null }
  | { ok: false; error: string };

// -------------------------------------------------------------------------
// Modo CLI — yt-dlp instalado localmente no cloud2
// -------------------------------------------------------------------------

async function downloadViaCli(url: string, outDir: string): Promise<string> {
  const template = join(outDir, "%(artist)s - %(title)s.%(ext)s");
  await execFileAsync(
    "yt-dlp",
    [
      url,
      "-o", template,
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "192K",
      "--no-playlist",
      "--extractor-args", "youtube:player_client=android,web",
    ],
    { timeout: 15 * 60 * 1000 },
  );

  // Retorna o primeiro .mp3 encontrado no outDir
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(outDir).filter((f) => f.endsWith(".mp3"));
  if (files.length === 0) throw new Error("yt-dlp não gerou arquivo .mp3");
  return join(outDir, files[0]!);
}

// -------------------------------------------------------------------------
// Modo servidor HTTP
// -------------------------------------------------------------------------

async function submitToYtdlServer(url: string): Promise<string> {
  const res = await fetch(`${YTDL_URL}/api/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`yt-dlp-server /api/queue retornou ${res.status}`);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("yt-dlp-server não retornou id");
  return data.id;
}

async function waitForYtdlServer(id: string): Promise<YtdlServerStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${YTDL_URL}/api/queue/${id}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`yt-dlp-server /api/queue/${id} retornou ${res.status}`);
    const data = (await res.json()) as YtdlServerStatus;
    if (data.status === "done" || data.status === "completed") return data;
    if (data.status === "error" || data.status === "failed") {
      throw new Error("yt-dlp-server reportou erro no download");
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timeout aguardando yt-dlp-server");
}

// -------------------------------------------------------------------------

export async function processYoutube(itemId: string, linhaOriginal: string): Promise<ProcessResult> {
  try {
    if (YTDL_URL) {
      // Modo servidor HTTP
      const id = await submitToYtdlServer(linhaOriginal);
      const result = await waitForYtdlServer(id);

      const filePath = result.filename ? join(STAGING_DIR, result.filename) : null;
      if (!filePath || !existsSync(filePath)) {
        throw new Error(`Arquivo yt-dlp não encontrado em ${filePath ?? STAGING_DIR}`);
      }

      const filename = basename(filePath);
      const r2Filename = `${itemId.slice(0, 8)}_${filename}`;
      const storageKey = await uploadToR2({
        localPath: filePath,
        provider: "youtube",
        jobId: itemId,
        filename: r2Filename,
      });

      return {
        ok: true,
        storageKey,
        arquivoNome: filename,
        titulo: result.title ?? filename.replace(/\.mp3$/, ""),
        artista: result.artist ?? "",
        sizeBytes: statSync(filePath).size,
      };
    } else {
      // Modo CLI — yt-dlp no PATH do cloud2
      const tempDir = await mkdtemp(join(tmpdir(), "ytdlp-"));
      try {
        const filePath = await downloadViaCli(linhaOriginal, tempDir);
        const filename = basename(filePath);
        const r2Filename = `${itemId.slice(0, 8)}_${filename}`;
        const storageKey = await uploadToR2({
          localPath: filePath,
          provider: "youtube",
          jobId: itemId,
          filename: r2Filename,
        });
        const sizeBytes = statSync(filePath).size;
        return {
          ok: true,
          storageKey,
          arquivoNome: filename,
          titulo: filename.replace(/\.mp3$/, ""),
          artista: "",
          sizeBytes,
        };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
