import { getDownloadServiceConfig } from "@/lib/criacao/downloadConfig";

export type StagingIngestPair = {
  processamentoItemId: string;
  downloadItemId: string;
};

export function ingestFromStagingUrl(): string | null {
  const processUrl = getDownloadServiceConfig().cloud2ProcessUrl;
  if (!processUrl) return null;
  return processUrl.replace(/\/download\/process\/?$/, "/ingest-from-staging");
}

export async function ingestFromStagingOnCloud2(
  pairs: StagingIngestPair[],
): Promise<{ ok: boolean; imported: number; errors: string[] }> {
  const url = ingestFromStagingUrl();
  if (!url) {
    return { ok: false, imported: 0, errors: ["CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL não configurado."] };
  }
  if (pairs.length === 0) return { ok: true, imported: 0, errors: [] };

  const cfg = getDownloadServiceConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.cloud2ProcessSecret) headers.Authorization = `Bearer ${cfg.cloud2ProcessSecret}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ pairs }),
      signal: AbortSignal.timeout(120_000),
    });
    const raw = await res.text();
    let data: {
      ok?: boolean;
      imported?: number;
      errors?: string[];
      error?: string;
    } = {};
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return {
        ok: false,
        imported: 0,
        errors: [
          res.ok ?
            "Resposta inválida do cloud2 (ingest-from-staging)."
          : `cloud2 HTTP ${res.status}${raw ? `: ${raw.slice(0, 120)}` : ""}`,
        ],
      };
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        imported: data.imported ?? 0,
        errors: data.errors?.length ? data.errors : [data.error ?? `HTTP ${res.status}`],
      };
    }
    return { ok: true, imported: data.imported ?? pairs.length, errors: data.errors ?? [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_rede";
    return { ok: false, imported: 0, errors: [msg] };
  }
}
