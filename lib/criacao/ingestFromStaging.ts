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

/** Deve coincidir com o teto por request no cloud2 (até deploy remover o cap). */
const INGEST_STAGING_BATCH_SIZE = 100;

async function ingestFromStagingBatchOnCloud2(
  url: string,
  headers: Record<string, string>,
  pairs: StagingIngestPair[],
): Promise<{ ok: boolean; imported: number; errors: string[] }> {
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

  let imported = 0;
  const errors: string[] = [];
  for (let i = 0; i < pairs.length; i += INGEST_STAGING_BATCH_SIZE) {
    const chunk = pairs.slice(i, i + INGEST_STAGING_BATCH_SIZE);
    const r = await ingestFromStagingBatchOnCloud2(url, headers, chunk);
    imported += r.imported;
    errors.push(...r.errors);
    if (!r.ok && r.imported === 0) {
      return { ok: false, imported, errors };
    }
  }
  return { ok: imported > 0 || errors.length === 0, imported, errors };
}
