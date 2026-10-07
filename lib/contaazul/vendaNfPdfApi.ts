import { CONTA_AZUL_API_BASE } from "./config";

const RX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 500 && buf.subarray(0, 5).toString() === "%PDF-";
}

/**
 * Resumo/impressão da venda no ERP — **não** é o DANFSE da NFS-e (use `service-invoice`).
 * GET /v1/venda/{id_venda}/imprimir
 */
export async function fetchVendaImprimirPdfApi(
  accessToken: string,
  idVenda: string,
): Promise<Buffer | null> {
  const id = idVenda.trim();
  if (!RX_UUID.test(id)) return null;

  const url = `${CONTA_AZUL_API_BASE}/v1/venda/${encodeURIComponent(id)}/imprimir`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/pdf,application/octet-stream,*/*",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("json") || ct.includes("html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return looksLikePdf(buf) ? buf : null;
  } catch {
    return null;
  }
}
