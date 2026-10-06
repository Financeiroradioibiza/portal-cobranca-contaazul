/**
 * PDF da NFS-e (DANFSE) por venda — mesmo caminho usado pelo ERP / integrações legadas.
 * Documentado na prática em: app.contaazul.com/pub/rest/billing-data/…
 * @param vendaId - UUID da venda Conta Azul (mesmo de `evento.referencia.id` quando origem é venda).
 */
const BILLING_SERVICE_INVOICE_PDF =
  "https://app.contaazul.com/pub/rest/billing-data/service-invoice";

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 500 && buf.subarray(0, 5).toString() === "%PDF-";
}

export async function fetchServiceInvoicePdfBufferByVendaId(
  vendaId: string,
  accessToken: string,
): Promise<Buffer | null> {
  const id = vendaId.trim();
  if (!id) return null;

  const url = `${BILLING_SERVICE_INVOICE_PDF}/${encodeURIComponent(id)}/pdf`;

  /** ERP legado usa fetch sem Bearer; tentamos nessa ordem. */
  for (const withBearer of [false, true]) {
    try {
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
        (ct.includes("text/plain") && !ct.includes("pdf"))
      ) {
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (looksLikePdf(buf)) return buf;
    } catch {
      continue;
    }
  }

  return null;
}

/** @deprecated Prefer `fetchServiceInvoicePdfBufferByVendaId`. */
export async function fetchServiceInvoicePdfByVendaId(
  vendaId: string,
  accessToken: string,
): Promise<Response | null> {
  const buf = await fetchServiceInvoicePdfBufferByVendaId(vendaId, accessToken);
  if (!buf) return null;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
}
