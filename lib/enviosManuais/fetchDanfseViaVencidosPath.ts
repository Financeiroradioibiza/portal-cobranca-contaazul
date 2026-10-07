import { isDanfsePdfBuffer } from "@/lib/contaazul/danfsePdf";
import { resolveParcelaDanfseMeta } from "@/lib/contaazul/resolveParcelaDanfseMeta";
import { fetchServiceInvoicePdfBufferByOpenUrl } from "@/lib/contaazul/serviceInvoicePdf";

function acceptableDanfse(buf: Buffer): boolean {
  return isDanfsePdfBuffer(buf) || buf.length >= 50_000;
}

/**
 * Mesmo caminho do Financeiro → Vencidos → Nota:
 * `resolveParcelaDanfseMeta` + PDF em `service-invoice/{id_venda}/pdf`.
 */
export async function fetchDanfsePdfViaVencidosPath(
  token: string,
  parcelaId: string,
): Promise<{ buffer: Buffer; filename: string; idVenda: string; openUrl: string } | null> {
  const meta = await resolveParcelaDanfseMeta(token, parcelaId);
  if (!meta?.openUrl?.trim()) return null;

  const buf = await fetchServiceInvoicePdfBufferByOpenUrl(meta.openUrl, token);
  if (!buf || !acceptableDanfse(buf)) return null;

  return {
    buffer: buf,
    filename: meta.filename,
    idVenda: meta.idVenda,
    openUrl: meta.openUrl,
  };
}
