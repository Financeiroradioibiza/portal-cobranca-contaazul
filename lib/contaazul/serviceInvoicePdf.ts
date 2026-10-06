import https from "node:https";

/**
 * PDF da NFS-e (DANFSE) por venda — mesmo caminho usado pelo ERP / integrações legadas.
 * Documentado na prática em: app.contaazul.com/pub/rest/billing-data/…
 * @param vendaId - UUID da venda Conta Azul (mesmo de `evento.referencia.id` quando origem é venda).
 */
const BILLING_SERVICE_INVOICE_PDF =
  "https://app.contaazul.com/pub/rest/billing-data/service-invoice";

const PDF_HEADERS = {
  Accept: "application/pdf,application/octet-stream,*/*",
  "User-Agent":
    "Mozilla/5.0 (compatible; RadioIbizaPortal/1.0; +https://portal.radioibiza.app.br)",
  Referer: "https://app.contaazul.com/",
};

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 500 && buf.subarray(0, 5).toString() === "%PDF-";
}

function fetchPdfViaNodeHttps(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: PDF_HEADERS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchPdfViaNodeHttps(res.headers.location).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(looksLikePdf(buf) ? buf : null);
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(25_000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function fetchPdfViaFetch(
  url: string,
  accessToken: string,
  withBearer: boolean,
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        ...PDF_HEADERS,
        ...(withBearer ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (
      ct.includes("application/json") ||
      ct.includes("text/html") ||
      (ct.includes("text/plain") && !ct.includes("pdf"))
    ) {
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return looksLikePdf(buf) ? buf : null;
  } catch {
    return null;
  }
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
    const buf = await fetchPdfViaFetch(url, accessToken, withBearer);
    if (buf) return buf;
  }

  return fetchPdfViaNodeHttps(url);
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
