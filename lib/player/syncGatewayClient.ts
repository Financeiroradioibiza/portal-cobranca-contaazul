/** PDVs por requisição ao cloud2 (evita timeout Netlify/nginx). */
export const SYNC_PDV_BATCH_SIZE = 10;

export type SyncGatewayBatchResult = {
  ok?: boolean;
  error?: string;
  done?: boolean;
  nextOffset?: number;
  totalClientes?: number;
  totalPdvs?: number;
  clientesSynced?: number;
  pdvsSynced?: number;
};

async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        "O servidor demorou demais ou caiu (resposta HTML). Aguarde e tente de novo.",
      );
    }
    throw new Error("Resposta inválida do servidor.");
  }
}

/** Sincroniza Player 5 em lotes de 10 PDVs (várias chamadas curtas ao portal). */
export async function runPlayerGatewaySyncBatches(
  onProgress?: (syncedPdvs: number, totalPdvs: number | null) => void,
): Promise<{ clientes: number; pdvs: number }> {
  let offset = 0;
  let totalClientes = 0;
  let syncedPdvs = 0;
  let totalPdvs: number | null = null;

  while (true) {
    onProgress?.(syncedPdvs, totalPdvs);

    const res = await fetch("/api/player/sync-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, batchSize: SYNC_PDV_BATCH_SIZE }),
    });
    const data = await parseApiJson<SyncGatewayBatchResult>(res);
    if (!res.ok) throw new Error(data.error ?? "falhou");

    totalClientes = data.totalClientes ?? totalClientes;
    totalPdvs = data.totalPdvs ?? totalPdvs;
    syncedPdvs += data.pdvsSynced ?? 0;

    if (data.done) {
      return {
        clientes: totalClientes || data.clientesSynced || 0,
        pdvs: totalPdvs ?? syncedPdvs,
      };
    }

    offset = data.nextOffset ?? offset + SYNC_PDV_BATCH_SIZE;
  }
}
