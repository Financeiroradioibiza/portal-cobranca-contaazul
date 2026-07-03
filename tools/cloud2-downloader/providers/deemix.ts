/**
 * Integração com Deemix (auto-hospedado, porta padrão 6595).
 *
 * Deemix baixa tracks/albums/playlists do Deezer.
 *
 * API (deemix-server / deemix-gui):
 *   POST /api/addToQueue       { url, bitrate }  → { obj: { uuid } }
 *   GET  /api/queueSlots       → status atual
 *   GET  /api/getQueue         → { queueList: { [uuid]: { downloaded, errors } } }
 *
 * Arquivo salvo localmente no CRIACAO_DOWNLOAD_STAGING_DIR.
 */

import { join, basename } from "node:path";
import { existsSync, statSync } from "node:fs";
import { uploadToR2 } from "../r2.ts";

const DEEMIX_URL = (process.env.CRIACAO_DEEMIX_URL ?? "").replace(/\/$/, "");
const STAGING_DIR = process.env.CRIACAO_DOWNLOAD_STAGING_DIR ?? "/data/staging";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 min

// Bitrate: 1=128k, 3=320k, 9=FLAC
const BITRATE = 3;

type DeemixQueueItem = {
  downloaded?: number;
  errors?: number;
  files?: string[];
  title?: string;
  artist?: string;
};

type ProcessResult =
  | { ok: true; storageKey: string; arquivoNome: string; titulo: string; artista: string; sizeBytes: number | null }
  | { ok: false; error: string };

async function submitToDeemix(url: string): Promise<string> {
  const res = await fetch(`${DEEMIX_URL}/api/addToQueue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, bitrate: BITRATE }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Deemix /addToQueue retornou ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { obj?: { uuid?: string } };
  const uuid = data.obj?.uuid;
  if (!uuid) throw new Error("Deemix não retornou uuid");
  return uuid;
}

async function waitForDeemix(uuid: string): Promise<DeemixQueueItem> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${DEEMIX_URL}/api/getQueue`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Deemix /getQueue retornou ${res.status}`);
    const data = (await res.json()) as { queueList?: Record<string, DeemixQueueItem> };
    const item = data.queueList?.[uuid];

    if (!item) throw new Error(`UUID ${uuid} não encontrado na fila do Deemix`);
    if ((item.errors ?? 0) > 0) throw new Error("Deemix reportou erro no download");
    if ((item.downloaded ?? 0) > 0) return item;

    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timeout aguardando Deemix");
}

export async function processDeemix(itemId: string, linhaOriginal: string): Promise<ProcessResult> {
  if (!DEEMIX_URL) {
    return { ok: false, error: "CRIACAO_DEEMIX_URL não configurada no cloud2." };
  }

  const isUrl = /^https?:\/\//i.test(linhaOriginal);
  if (!isUrl) {
    return {
      ok: false,
      error:
        "Deemix requer URL do Deezer. Para texto livre, cole o link direto: https://www.deezer.com/track/...",
    };
  }

  try {
    const uuid = await submitToDeemix(linhaOriginal);
    const result = await waitForDeemix(uuid);

    // Deemix salva no diretório de download configurado no deemix-server
    const files = result.files ?? [];
    const filePath = files.length > 0 ? join(STAGING_DIR, files[0]!) : null;

    if (!filePath || !existsSync(filePath)) {
      throw new Error(
        `Arquivo Deemix não encontrado em ${filePath ?? STAGING_DIR}. ` +
          "Verifique se o volume do Deemix está montado em CRIACAO_DOWNLOAD_STAGING_DIR.",
      );
    }

    const filename = basename(filePath);
    const r2Filename = `${itemId.slice(0, 8)}_${filename}`;
    const storageKey = await uploadToR2({
      localPath: filePath,
      provider: "deemix",
      jobId: itemId,
      filename: r2Filename,
    });

    const sizeBytes = statSync(filePath).size;

    return {
      ok: true,
      storageKey,
      arquivoNome: filename,
      titulo: result.title ?? filename.replace(/\.\w+$/, ""),
      artista: result.artist ?? "",
      sizeBytes,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
