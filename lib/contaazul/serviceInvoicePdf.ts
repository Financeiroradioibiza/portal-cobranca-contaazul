/**
 * PDF da NFS-e (DANFSE) por venda — mesmo caminho usado pelo ERP / integrações legadas.
 * Documentado na prática em: app.contaazul.com/pub/rest/billing-data/…
 * @param vendaId - UUID da venda Conta Azul (mesmo de `evento.referencia.id` quando origem é venda).
 */
const BILLING_SERVICE_INVOICE_PDF =
  "https://app.contaazul.com/pub/rest/billing-data/service-invoice";

export async function fetchServiceInvoicePdfByVendaId(
  vendaId: string,
  accessToken: string,
): Promise<Response | null> {
  const id = vendaId.trim();
  if (!id) return null;

  const url = `${BILLING_SERVICE_INVOICE_PDF}/${encodeURIComponent(id)}/pdf`;

  for (const withBearer of [true, false]) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/pdf,application/octet-stream,*/*",
        ...(withBearer ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!res.ok) continue;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (
      ct.includes("application/json") ||
      ct.includes("text/html") ||
      ct.includes("text/plain")
    ) {
      continue;
    }

    const clone = res.clone();
    const peek = await clone.arrayBuffer();
    if (peek.byteLength < 500) continue;

    return res;
  }

  return null;
}
