import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";

export type PrimeiroPingRow = {
  rowId: string;
  pdvId: number;
  pdvNome: string;
  codigoDisplay: string | null;
  clienteId: number;
  clienteNome: string;
  firstPingAt: string;
  ativo?: boolean;
};

export async function listPrimeiroPingRows(): Promise<{
  ok: boolean;
  rows: PrimeiroPingRow[];
  error?: string;
}> {
  if (!cloud2Enabled()) {
    return { ok: false, rows: [], error: "cloud2_desabilitado" };
  }

  const res = await cloud2FetchWithTimeout("/player/first-pings", { method: "GET" }, 20_000);
  if (!res) {
    return { ok: false, rows: [], error: "first_pings_timeout" };
  }
  const data = await parseCloud2Json<{
    ok?: boolean;
    error?: string;
    rows?: PrimeiroPingRow[];
  }>(res, "first_pings");

  if (!res.ok || !data.ok) {
    return { ok: false, rows: [], error: data.error ?? "first_pings_falhou" };
  }

  return { ok: true, rows: Array.isArray(data.rows) ? data.rows : [] };
}
