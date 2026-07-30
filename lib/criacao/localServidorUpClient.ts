/** Cliente do agente local Servidor UP (scan legado, Deemix, ffprobe no PC). */

export const LOCAL_SERVIDOR_UP_BASE =
  process.env.NEXT_PUBLIC_SERVIDOR_UP_URL ?? "https://127.0.0.1:8766";

export type LocalServidorUpHealth = {
  ok: boolean;
  version?: string;
  capabilities?: string[];
  ffprobe?: boolean;
  fpcalc?: boolean;
  rootPath?: string;
};

export type LocalServidorUpTrack = {
  relativePath: string;
  fileName: string;
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
  artista: string;
  titulo: string;
  durationSec: number | null;
  bitrateKbps?: number | null;
  sizeBytes?: number;
  contentHash?: string | null;
  chromaprint?: string | null;
};

export type LocalServidorUpFingerprintRow = {
  relativePath: string;
  contentHash: string | null;
  chromaprint: string | null;
  error?: string;
};

export type LocalServidorUpInventory = {
  ok: boolean;
  rootPath: string;
  tracks: LocalServidorUpTrack[];
  stats: { total: number; skipped: number; ffprobe?: boolean };
};

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LOCAL_SERVIDOR_UP_BASE}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(init?.method === "POST" ? 120_000 : 5_000),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "servidor_up_erro");
  }
  return data;
}

export async function pingLocalServidorUp(): Promise<LocalServidorUpHealth | null> {
  try {
    const data = await localFetch<LocalServidorUpHealth>("/health", {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

export async function getLocalServidorUpConfig(): Promise<string> {
  try {
    const data = await localFetch<{ rootPath?: string }>("/config");
    return (data.rootPath ?? "").trim();
  } catch {
    return "";
  }
}

export async function setLocalServidorUpConfig(rootPath: string): Promise<string> {
  const data = await localFetch<{ rootPath: string }>("/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rootPath: rootPath.trim() }),
  });
  return data.rootPath;
}

export async function scanLocalServidorUpPaths(rootPath?: string): Promise<Array<{ path: string }>> {
  const data = await localFetch<{ files: Array<{ path: string }> }>("/scan/paths", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rootPath ? { rootPath } : {}),
  });
  return data.files ?? [];
}

export async function scanLocalServidorUpInventory(rootPath?: string): Promise<LocalServidorUpInventory> {
  return localFetch<LocalServidorUpInventory>("/scan/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rootPath ? { rootPath } : {}),
  });
}

export async function scanLocalServidorUpFingerprints(
  relativePaths: string[],
  rootPath?: string,
): Promise<{ rows: LocalServidorUpFingerprintRow[]; stats: { total: number; fpcalc?: boolean } }> {
  const data = await localFetch<{
    rows: LocalServidorUpFingerprintRow[];
    stats: { total: number; fpcalc?: boolean };
  }>("/scan/fingerprints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rootPath: rootPath?.trim() || undefined,
      relativePaths: relativePaths.slice(0, 80),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  return { rows: data.rows ?? [], stats: data.stats ?? { total: 0 } };
}

/** URL tocável do MP3 legado no agente local (Servidor UP). */
export function buildLocalLegacyAudioUrl(relativePath: string): string {
  const qs = new URLSearchParams({ rel: relativePath.trim() });
  return `${LOCAL_SERVIDOR_UP_BASE}/audio?${qs.toString()}`;
}
