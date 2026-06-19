/** Cliente do app local de download (yt-dlp no computador do usuário). */

export const LOCAL_DOWNLOADER_BASE =
  process.env.NEXT_PUBLIC_LOCAL_DOWNLOADER_URL ?? "http://127.0.0.1:8765";

export type LocalDownloadTrack = {
  id: string;
  title: string;
  artist: string;
  suggestedFilename: string;
  status: "pending" | "downloading" | "done" | "failed" | "skipped";
  error?: string;
  sizeBytes?: number;
};

export type LocalDownloadJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  total: number;
  done: number;
  failed: number;
  items: LocalDownloadTrack[];
};

export async function pingLocalDownloader(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_DOWNLOADER_BASE}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function startLocalDownload(
  tracks: Array<{ title: string; artist: string; suggestedFilename: string }>,
): Promise<LocalDownloadJob> {
  const res = await fetch(`${LOCAL_DOWNLOADER_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "local_download_start_failed");
  }
  return res.json() as Promise<LocalDownloadJob>;
}

export async function getLocalDownloadJob(jobId: string): Promise<LocalDownloadJob> {
  const res = await fetch(`${LOCAL_DOWNLOADER_BASE}/jobs/${encodeURIComponent(jobId)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error("local_download_status_failed");
  return res.json() as Promise<LocalDownloadJob>;
}

/** Busca MP3 concluídos do app local como File[] para o upload. */
export async function fetchLocalDownloadFiles(jobId: string): Promise<File[]> {
  const res = await fetch(`${LOCAL_DOWNLOADER_BASE}/jobs/${encodeURIComponent(jobId)}/files`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error("local_download_files_failed");

  const data = (await res.json()) as {
    files: Array<{ filename: string; base64: string; mime: string }>;
  };

  return data.files.map((f) => {
    const bin = atob(f.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], f.filename, { type: f.mime || "audio/mpeg" });
  });
}
